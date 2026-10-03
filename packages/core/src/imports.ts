import {createTalentIntake} from './talent-intake.ts';
import {TalentV2} from './talent-v2.ts';
import {TALENT_FACT_TABLES} from './talent-v2-model.ts';
import {td2PersonFor} from './talent-v2-graph.ts';
import {shortlistFor} from './shortlists.ts';
import {sourceAllowsInternalAuthoring} from './talent-maintenance-policy.ts';
import { randomUUID } from 'node:crypto';
import type { Actor, Clock, Config, DurableJob, ImportBatch, ImportRow } from './model.ts';
import { LIMITS } from './model.ts';
import type { Store, Tx } from './store.ts';
import { AppError, invariant, missing } from './errors.ts';
import { audit, base, cas, touch, unique, workspaceRow, page } from './helpers.ts';
import { requirePermission, sourceFor, permissionsFor } from './policy.ts';
import { PersonImportRow, PersonImportV2Row, Schemas } from './validation.ts';
import { Talent } from './talent.ts';
const RETRYABLE_IMPORT_ERRORS = new Set(['STORE_BUSY', 'STORE_UNAVAILABLE']);
export class Imports {
    store: Store;
    clock: Clock;
    config: Config;
    talent: Talent;
    constructor(store: Store, clock: Clock, config: Config, talent: Talent) { this.store = store; this.clock = clock; this.config = config; this.talent = talent; }
    async preview(tx: Tx, actor: Actor, input: unknown): Promise<ImportBatch> {
        requirePermission(actor, 'records.write');
        const data = Schemas.importPreview.parse(input);
        const source = await sourceFor(tx, actor, data.sourceId, this.clock);invariant(sourceAllowsInternalAuthoring(source),'TALENT_BASIS_SCOPED','本人文字来源仅支持已批准的本次内容；新增内部资料须使用独立来源',409);
        const formatVersion=data.schemaVersion==='once-talent-import-v2'?2:1;
        const rows: ImportRow[] = [];
        // One batch read, not one full talent traversal per input row. Names remain permission-filtered.
        const visibleNames = new Set((await this.talent.visiblePeople(tx, actor)).map(p => p.displayName));
        const activeCodes = new Set((await tx.find('dictionary', { workspaceId: actor.workspaceId }))
            .filter(d => d.status === 'ACTIVE').map(d => d.namespace + ':' + d.code));
        const checkCodes = (namespace: string, codes: string[]) => {
            invariant(unique(codes).length === codes.length, 'DUPLICATE_CODE', '同一分类不能重复', 400);
            for (const code of codes) invariant(activeCodes.has(namespace + ':' + code), 'CATALOG_INVALID', '所选分类不存在或已停用，请刷新分类选项', 422);
        };
        const batchNames = new Set<string>();
        for (let index = 0; index < data.rows.length; index++) {
            try {
                const row = formatVersion===2?PersonImportV2Row.parse(data.rows[index]):{...PersonImportRow.parse(data.rows[index]),kind:undefined};
                const kind=row.kind??(row.roles.length?'TALENT':'CONTACT');
                invariant(kind==='TALENT'?row.roles.length>0:row.roles.length===0&&!row.cityCode,'IMPORT_KIND_INVALID','人才须提供职业；普通联系人暂只导入姓名，城市请在专业档案中维护',422);
                checkCodes('role', row.roles);
                if (row.cityCode) checkCodes('city', [row.cityCode]);
                const duplicateName = visibleNames.has(row.displayName) || batchNames.has(row.displayName);
                batchNames.add(row.displayName);
                rows.push({ index, ...(formatVersion===2?{kind}:{}), displayName: row.displayName, roles: row.roles, cityCode: row.cityCode ?? null, state: 'VALID',
                    issues: duplicateName ? ['同名仅提示：提交仍会创建独立档案，不自动合并'] : [], personId: null });
            }
            catch (e) {
                rows.push({ index, displayName: '', roles: [], cityCode: null, state: 'INVALID', issues: [e instanceof AppError ? e.message : '本行格式无效'], personId: null });
            }
        }
        const batch: ImportBatch = { ...base(actor.workspaceId, this.clock), formatVersion, actorId: actor.membershipId, sourceId: source.id, sourceRevision: source.revision,
            scopeId: source.scopeId, rows, expiresAt: new Date(Math.min(Date.parse(source.validUntil), this.clock.now().getTime() + LIMITS.importMs)).toISOString() };
        await tx.insert('imports', batch);
        return batch;
    }
    async batchFor(tx: Tx, actor: Actor, id: string): Promise<ImportBatch> {
        requirePermission(actor, 'records.write');
        const batch = await workspaceRow(tx, 'imports', id, actor.workspaceId);
        if (!batch || batch.actorId !== actor.membershipId)
            missing();
        await sourceFor(tx, actor, batch.sourceId, this.clock);
        if (Date.parse(batch.expiresAt) <= this.clock.now().getTime())
            missing();
        return batch;
    }
    async get(tx: Tx, actor: Actor, id: string): Promise<unknown> {
        const batch = await this.batchFor(tx, actor, id);
        const job = (await tx.find('jobs', { workspaceId: actor.workspaceId, aggregateId: id }))[0];
        // The preview DTO does not contain contact values or entire source text.
        return { id: batch.id, formatVersion:batch.formatVersion??1, sourceId: batch.sourceId, revision: batch.revision, rows: batch.rows, expiresAt: batch.expiresAt,
            job: job ? { id: job.id, state: job.state, errorCode: job.errorCode } : null };
    }
    async commit(tx: Tx, actor: Actor, id: string, input: unknown): Promise<DurableJob> {
        const data = Schemas.importCommit.parse(input);
        const batch = await this.batchFor(tx, actor, id);
        const existing = (await tx.find('jobs', { workspaceId: actor.workspaceId, aggregateId: batch.id }))[0];
        invariant(!existing, 'BATCH_ALREADY_COMMITTED', '该批次已经提交；请查看原任务，不能更换已提交的行集合', 409);
        cas(batch, data.expectedRevision);
        const source = await sourceFor(tx, actor, batch.sourceId, this.clock);
        cas(source, batch.sourceRevision);
        invariant(unique(data.selectedRows).length === data.selectedRows.length, 'DUPLICATE_ROW', '选择的导入行不能重复', 400);
        for (const index of data.selectedRows)
            invariant(batch.rows[index]?.state === 'VALID', 'IMPORT_ROW_INVALID', '只能选择已通过预览检查的行');
        const job: DurableJob = { ...base(actor.workspaceId, this.clock), type: batch.formatVersion===2?'IMPORT_TALENTS_V2':'IMPORT_PEOPLE', actorId: actor.membershipId, aggregateId: batch.id,
            selectedRows: data.selectedRows, state: 'QUEUED', leaseToken: null, leaseUntil: null, attempts: 0, errorCode: null };
        await tx.insert('jobs', job);
        await tx.replace('imports', touch(batch, this.clock));
        return job;
    }
    private async resumeChecks(tx: Tx, actor: Actor, job: DurableJob): Promise<ImportBatch> {
        invariant(job.state === 'FAILED', 'JOB_NOT_FAILED', '只能继续已经失败的任务', 409);
        invariant(RETRYABLE_IMPORT_ERRORS.has(job.errorCode ?? ''), 'JOB_NOT_RETRYABLE', '该错误不能直接继续；请核查来源、权限或重新整理未完成资料', 409);
        invariant(job.attempts < LIMITS.jobMaxAttempts, 'ATTEMPTS_EXHAUSTED', '已达到本批次领取上限，请联系维护人员核对', 409);
        await this.actorForJob(tx, job);
        const batch = await this.batchFor(tx, actor, job.aggregateId);
        const source = await sourceFor(tx, actor, batch.sourceId, this.clock);
        cas(source, batch.sourceRevision);
        for (const index of job.selectedRows) {
            const row = batch.rows[index];
            invariant(row && (row.state === 'VALID' || row.state === 'IMPORTED'), 'ROW_INVALID', '导入检查点无法继续', 409);
            // Never recreate a committed row whose referenced entity was removed or altered externally.
            if (row.state === 'IMPORTED') {
                const person = row.personId ? await workspaceRow(tx, 'people', row.personId, job.workspaceId) : null;
                invariant(person && person.sourceId === batch.sourceId, 'CHECKPOINT_INVALID', '已入库行的关联不完整，请人工核对', 409);
            }
        }
        return batch;
    }
    async resume(tx: Tx, actor: Actor, id: string, input: unknown): Promise<DurableJob> {
        requirePermission(actor, 'records.write');
        const data = Schemas.revision.parse(input);
        const job = await workspaceRow(tx, 'jobs', id, actor.workspaceId);
        if (!job || job.actorId !== actor.membershipId) missing();
        cas(job, data.expectedRevision); // Receipt replay is handled before this method.
        await this.resumeChecks(tx, actor, job);
        const next: DurableJob = { ...touch(job, this.clock), state: 'QUEUED', leaseToken: null, leaseUntil: null, errorCode: null };
        await tx.replace('jobs', next);
        return next;
    }
    private async jobDto(tx: Tx, actor: Actor, job: DurableJob): Promise<unknown> {
        const batch = await workspaceRow(tx, 'imports', job.aggregateId, job.workspaceId);
        const importedCount = batch ? job.selectedRows.filter(i => batch.rows[i]?.state === 'IMPORTED').length : 0;
        let canResume = false;
        let resumeBlockedReason: string | null = null;
        if (job.state === 'FAILED') {
            try { await this.resumeChecks(tx, actor, job); canResume = true; }
            catch (e) {
                // Do not turn an infrastructure exception into a plausible business denial.
                if (!(e instanceof AppError) || e.status >= 500) throw e;
                resumeBlockedReason = e.code;
            }
        }
        return { id: job.id, type: job.type, aggregateId: job.aggregateId, state: job.state, attempts: job.attempts,
            errorCode: job.errorCode, revision: job.revision, createdAt: job.createdAt,
            importedCount, selectedCount: job.selectedRows.length, canResume, resumeBlockedReason };
    }
    async actorForJob(tx: Tx, job: DurableJob): Promise<Actor> {
        const member = await workspaceRow(tx, 'memberships', job.actorId, job.workspaceId);
        const user = member ? await workspaceRow(tx, 'users', member.userId, job.workspaceId) : null;
        const workspace = await tx.get('workspaces', job.workspaceId);
        invariant(member?.status === 'ACTIVE' && user?.status === 'ACTIVE', 'ACTOR_DISABLED', '任务发起者已失去资格', 403);
        invariant(this.config.accessMode === 'INTERNAL' && workspace?.recoveryEpoch === this.config.recoveryEpoch, 'MAINTENANCE', '当前运行环境尚未解除隔离', 503);
        const actor: Actor = { userId: user.id, membershipId: member.id, workspaceId: job.workspaceId, role: member.role, permissions: permissionsFor(member),
            displayName: user.displayName, userEpoch: user.sessionEpoch, sessionId: 'worker' };
        requirePermission(actor, 'records.write');
        return actor;
    }
    async claim(): Promise<DurableJob | null> {
        if (this.config.accessMode !== 'INTERNAL')
            return null;
        return this.store.transaction(async (tx) => {
            const jobs = (await tx.find('jobs')).filter(j => j.state === 'QUEUED' || (j.state === 'RUNNING' && Date.parse(j.leaseUntil ?? '') <= this.clock.now().getTime()))
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
            for (const row of jobs) {
                const batch=await tx.get('imports',row.aggregateId);
                if(!batch||!this.compatible(row,batch)){await tx.replace('jobs',{...touch(row,this.clock),state:'FAILED',errorCode:'IMPORT_VERSION_UNSUPPORTED',leaseToken:null,leaseUntil:null});continue;}
                const workspace = await tx.get('workspaces', row.workspaceId);
                if (workspace?.recoveryEpoch !== this.config.recoveryEpoch)
                    continue;
                if (row.attempts >= LIMITS.jobMaxAttempts) {
                    await tx.replace('jobs', { ...touch(row, this.clock), state: 'FAILED', errorCode: 'ATTEMPTS_EXHAUSTED', leaseToken: null, leaseUntil: null });
                    continue;
                }
                const next: DurableJob = { ...touch(row, this.clock), state: 'RUNNING', leaseToken: randomUUID(), leaseUntil: new Date(this.clock.now().getTime() + LIMITS.jobLeaseMs).toISOString(), attempts: row.attempts + 1 };
                await tx.replace('jobs', next);
                return next;
            }
            return null;
        });
    }
    private compatible(job:DurableJob,batch:ImportBatch){return (batch.formatVersion??1)===1&&job.type==='IMPORT_PEOPLE'||batch.formatVersion===2&&job.type==='IMPORT_TALENTS_V2';}
    private async historicalBatch(tx:Tx,actor:Actor,id:string){requirePermission(actor,'records.write');const batch=await workspaceRow(tx,'imports',id,actor.workspaceId);if(!batch||batch.actorId!==actor.membershipId)missing();await sourceFor(tx,actor,batch.sourceId,this.clock);return batch;}
    async upgradePreview(tx:Tx,actor:Actor,id:string){
      const batch=await this.historicalBatch(tx,actor,id),source=await sourceFor(tx,actor,batch.sourceId,this.clock);const rows=[];
      invariant((batch.formatVersion??1)===1,'UPGRADE_NOT_LEGACY','新版批次已按专业档案写入，无需旧数据补齐',409);
      for(const row of batch.rows.filter(r=>r.state==='IMPORTED')){try{
        const p=await td2PersonFor(tx,actor,row.personId!);await sourceFor(tx,actor,p.sourceId,this.clock);
        invariant(p.sourceId===batch.sourceId&&p.status!=='ARCHIVED'&&sourceAllowsInternalAuthoring(source),'UPGRADE_REVIEW_REQUIRED','当前来源或档案状态需要先核对',409);
        const profiles=await tx.find('talentProfiles',{workspaceId:actor.workspaceId,personId:p.id});
        const roles=await tx.find('personRoles',{workspaceId:actor.workspaceId,personId:p.id});const cities=await tx.find('talentLocations',{workspaceId:actor.workspaceId,personId:p.id});
        const languages=await tx.find('personLanguages',{workspaceId:actor.workspaceId,personId:p.id}),capabilities=await tx.find('personCapabilities',{workspaceId:actor.workspaceId,personId:p.id});
        for(const fact of [...profiles,...roles,...cities,...languages,...capabilities])await sourceFor(tx,actor,fact.sourceId,this.clock);
        let state=profiles.length?(profiles.some(r=>r.status==='ACTIVE')&&p.roles.every(code=>roles.some(r=>r.roleCode===code&&r.status==='ACTIVE'))&&(!p.cityCode||cities.some(r=>r.locationCode===p.cityCode&&r.relationCode==='BASE'&&r.status==='ACTIVE'))&&p.languageCodes.every(code=>languages.some(r=>r.languageCode===code&&r.status==='ACTIVE'))&&p.skillCodes.every(code=>capabilities.some(r=>r.capabilityCode===code&&r.status==='ACTIVE'))?'COMPLETE':'REVIEW_REQUIRED'):'READY';
        if(state==='READY'){
          if(!p.roles.length)state='REVIEW_REQUIRED';
          for(const table of TALENT_FACT_TABLES)if((await tx.find(table,{workspaceId:actor.workspaceId,personId:p.id})).length)state='REVIEW_REQUIRED';
          const codes=new Set((await tx.find('dictionary',{workspaceId:actor.workspaceId,status:'ACTIVE'})).map(r=>r.namespace+':'+r.code));
          const definitions=await tx.find('capabilityDefinitions',{workspaceId:actor.workspaceId});
          if(p.roles.some(c=>!codes.has('role:'+c))||p.cityCode&&!codes.has('city:'+p.cityCode)||p.languageCodes.some(c=>!codes.has('language:'+c))||p.skillCodes.some(c=>{const def=definitions.find(d=>d.code===c);return def?def.status!=='ACTIVE':!codes.has('skill:'+c);}))state='REVIEW_REQUIRED';
        }
        if(state==='READY')for(const item of await tx.find('shortlistItems',{workspaceId:actor.workspaceId,personId:p.id})){if(!item.personRoleId)await shortlistFor(tx,actor,item.shortlistId);}
        rows.push({index:row.index,personId:p.id,displayName:p.displayName,expectedPersonRevision:p.revision,sourceRevision:source.revision,state,reason:state==='REVIEW_REQUIRED'?'已有人才档案；缺失或已改动项须逐项核对，不能自动恢复':null});
      }catch(e){if(!(e instanceof AppError)||e.status>=500)throw e;rows.push({index:row.index,state:'BLOCKED',reason:e.code});}}
      return {id:batch.id,revision:batch.revision,formatVersion:batch.formatVersion??1,rows};
    }
    async upgrade(tx:Tx,actor:Actor,id:string,input:unknown){
      const d=Schemas.importUpgrade.parse(input),batch=await this.historicalBatch(tx,actor,id);cas(batch,d.expectedRevision);invariant(d.confirm,'UPGRADE_CONFIRM_REQUIRED','请核对预览后确认补齐',422);
      invariant(new Set(d.entries.map(e=>e.index)).size===d.entries.length,'DUPLICATE_ROW','不能重复选择同一行',422);
      const preview=await this.upgradePreview(tx,actor,id),td=new TalentV2(this.clock,this.config);
      for(const entry of d.entries){const row=preview.rows.find(r=>r.index===entry.index);invariant(row&&'personId' in row&&row.state==='READY'&&row.personId===entry.personId,'UPGRADE_REVIEW_REQUIRED','该行不能自动补齐，请重新核对预览',409);
        await td.enroll(tx,actor,entry.personId,{schemaVersion:'once-talent-v2.1.0',expectedRevision:entry.expectedPersonRevision,sourceRevision:entry.sourceRevision});}
      const next=touch(batch,this.clock);await tx.replace('imports',next);return next;
    }
    private async owned(tx: Tx, claim: DurableJob): Promise<DurableJob> {
        const job = await workspaceRow(tx, 'jobs', claim.id, claim.workspaceId);
        invariant(job && job.state === 'RUNNING' && job.leaseToken === claim.leaseToken && Date.parse(job.leaseUntil ?? '') > this.clock.now().getTime(), 'LEASE_LOST', '任务租约已失效', 409);
        return job;
    }
    async process(claim: DurableJob): Promise<void> {
        try {
            for (const index of claim.selectedRows) {
                await this.store.transaction(async (tx) => {
                    const job = await this.owned(tx, claim);
                    const actor = await this.actorForJob(tx, job);
                    const batch = await this.batchFor(tx, actor, job.aggregateId);
                    invariant(this.compatible(job,batch),'IMPORT_VERSION_UNSUPPORTED','批次版本不受本程序支持',409);
                    const source = await sourceFor(tx, actor, batch.sourceId, this.clock);
                    cas(source, batch.sourceRevision);
                    const row = batch.rows[index];
                    invariant(row, 'ROW_MISSING', '导入行已不存在', 409);
                    if (row.state !== 'IMPORTED') {
                        invariant(row.state === 'VALID', 'ROW_INVALID', '导入行无法继续处理', 409);
                        let person;
                        if((batch.formatVersion??1)===1)person=await this.talent.createPerson(tx,actor,{displayName:row.displayName,roles:row.roles,cityCode:row.cityCode,sourceId:batch.sourceId});
                        else {invariant(!!row.kind,'IMPORT_CHECKPOINT_INVALID','新版导入缺少档案类型',409);person=await createTalentIntake(tx,actor,{schemaVersion:'once-talent-experience-v1',displayName:row.displayName,kind:row.kind,roleCodes:row.roles,sourceId:batch.sourceId,sourceRevision:batch.sourceRevision},this.clock,this.config);
                          if(row.cityCode){await new TalentV2(this.clock,this.config).createFact(tx,actor,'talentLocations',person.id,{schemaVersion:'once-talent-v2.1.0',expectedPersonRevision:person.revision,sourceId:batch.sourceId,sourceRevision:batch.sourceRevision,values:{locationCode:row.cityCode,relationCode:'BASE'}});}
                        }
                        const rows = [...batch.rows];
                        rows[index] = { ...row, personId: person.id, state: 'IMPORTED' };
                        await tx.replace('imports', { ...touch(batch, this.clock), rows });
                        await audit(tx, actor, job.workspaceId, 'import.row-created', 'person', person.id, ['created'], { requestId: job.id, ip: 'WORKER' }, this.clock);
                    }
                    await tx.replace('jobs', { ...job, leaseUntil: new Date(this.clock.now().getTime() + LIMITS.jobLeaseMs).toISOString() });
                });
            }
            await this.store.transaction(async (tx) => { const job = await this.owned(tx, claim); await tx.replace('jobs', { ...touch(job, this.clock), state: 'SUCCEEDED', leaseToken: null, leaseUntil: null }); });
        }
        catch (error) {
            if (error instanceof AppError && error.code === 'LEASE_LOST')
                return;
            await this.store.transaction(async (tx) => {
                const row = await tx.get('jobs', claim.id);
                if (row?.state === 'RUNNING' && row.leaseToken === claim.leaseToken && Date.parse(row.leaseUntil ?? '') > this.clock.now().getTime())
                    await tx.replace('jobs', { ...touch(row, this.clock), state: 'FAILED', leaseToken: null, leaseUntil: null, errorCode: error instanceof AppError ? error.code : 'JOB_FAILED' });
            });
        }
    }
    async listJobs(tx: Tx, actor: Actor, query: Record<string, string>): Promise<unknown> {
        requirePermission(actor, 'records.write');
        const rows = await tx.find('jobs', { workspaceId: actor.workspaceId, actorId: actor.membershipId });
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
        const selected = page(rows, query);
        const items = [];
        for (const job of selected.items) items.push(await this.jobDto(tx, actor, job));
        return { ...selected, items };
    }
    async getJob(tx: Tx, actor: Actor, id: string): Promise<unknown> {
        requirePermission(actor, 'records.write');
        const job = await workspaceRow(tx, 'jobs', id, actor.workspaceId);
        if (!job || job.actorId !== actor.membershipId)
            missing();
        // Only safe operation metadata is available after the source expires; batch contents stay blocked.
        return this.jobDto(tx, actor, job);
    }
}
