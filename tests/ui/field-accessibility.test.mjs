import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { Field } from '../../apps/admin-web/src/field.ts';

let browser;
before(async () => {
    browser = await chromium.launch({ headless: true,
        ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
});
after(async () => { if (browser) await browser.close(); });
async function pageWith(t, content) {
    const page = await browser.newPage();
    t.after(() => page.close());
    await page.setContent(renderToStaticMarkup(h('main', null, content)));
    return page;
}

// This control reproduces the former markup. It proves the test detects option/hint pollution.
test('negative control: the former implicit label does not provide an exact select name', async t => {
    const page = await pageWith(t, h('label', null, h('span', null, '制作归属'),
        h('select', null, h('option', { value: 'UNKNOWN' }, '归属待确认'),
            h('option', { value: 'EXTERNAL' }, '外部作品')), h('small', null, '不是自动认证')));
    assert.equal(await page.getByLabel('制作归属', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('combobox').count(), 1);
});

test('select has exact visible name independent of selected option and hint', async t => {
    const page = await pageWith(t, h(Field, { label: '制作归属', hint: '不是自动认证' },
        h('select', { defaultValue: 'UNKNOWN' }, h('option', { value: 'UNKNOWN' }, '归属待确认'),
            h('option', { value: 'EXTERNAL' }, '外部作品'))));
    const select = page.getByLabel('制作归属', { exact: true });
    assert.equal(await select.count(), 1);
    assert.equal(await page.getByRole('combobox', { name: '制作归属', exact: true }).count(), 1);
    await select.selectOption('EXTERNAL', { timeout: 2000 });
    assert.equal(await select.inputValue(), 'EXTERNAL');
    assert.equal(await select.getAttribute('aria-labelledby'), await page.locator('label > span').getAttribute('id'));
    const hintId = await select.getAttribute('aria-describedby');
    assert.equal(await page.locator('small').getAttribute('id'), hintId);
    assert.equal(await page.locator('small').innerText(), '不是自动认证');
});

test('input and textarea keep exact names; label click focuses the intended control', async t => {
    const page = await pageWith(t, [h(Field, { key: 1, label: '作品标题' }, h('input', { id: 'explicit-title' })),
        h(Field, { key: 2, label: '贡献说明', hint: '请如实填写实际工作' }, h('textarea'))]);
    const input = page.getByRole('textbox', { name: '作品标题', exact: true });
    await input.fill('合成作品');
    assert.equal(await input.getAttribute('id'), 'explicit-title');
    const textarea = page.getByLabel('贡献说明', { exact: true });
    await textarea.fill('合成摄影贡献');
    assert.equal(await textarea.inputValue(), '合成摄影贡献');
    await page.getByText('作品标题', { exact: true }).click();
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    await page.getByText('贡献说明', { exact: true }).click();
    assert.equal(await textarea.evaluate(el => el === document.activeElement), true);
});

test('multiple fields generate unique references and preserve existing descriptions', async t => {
    const page = await pageWith(t, [h('p', { key: 0, id: 'existing-description' }, '已有描述'),
        ...['甲', '乙'].map(label => h(Field, { key: label, label, hint: '补充说明' },
            h('input', { 'aria-describedby': 'existing-description existing-description' })))]);
    const ids = await page.locator('[id]').evaluateAll(elements => elements.map(el => el.id));
    assert.equal(new Set(ids).size, ids.length);
    for (const label of ['甲', '乙']) {
        const control = page.getByLabel(label, { exact: true });
        const refs = (await control.getAttribute('aria-describedby')).split(' ');
        assert.equal(refs.length, 2);
        assert.equal(refs[0], 'existing-description');
        assert.equal(await control.evaluate(el => el.getAttribute('aria-describedby').split(' ')
            .every(id => !!document.getElementById(id))), true);
    }
});

test('disabled fieldset still disables the correctly named native controls', async t => {
    const page = await pageWith(t, h('fieldset', { disabled: true },
        h(Field, { label: '贡献角色' }, h('select', null, h('option', null, '摄影师'))),
        h(Field, { label: '参与依据', hint: '请求核对期间不能修改' }, h('textarea'))));
    assert.equal(await page.getByLabel('贡献角色', { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel('参与依据', { exact: true }).isDisabled(), true);
});

test('existing composite single-select controls retain their native association', async t => {
    function City() { return h('select', null, h('option', null, '深圳')); }
    const page = await pageWith(t, h(Field, { label: '常驻城市' }, h(City)));
    assert.equal(await page.getByLabel('常驻城市', { exact: false }).count(), 1);
    assert.equal(await page.getByRole('combobox').inputValue(), '深圳');
});
