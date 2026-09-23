"""Apply this reviewed H1 patch on its dedicated branch; no dependency execution."""
import hashlib
import json
import pathlib
import subprocess
import tempfile

root = pathlib.Path.cwd().resolve()
plan = json.loads((root / '.agent/h1/plan.json').read_text())
assert plan['base'] == '0c2da7dc6a9553afa3ef6904a34395cab6961875'
paths = [entry['path'] for entry in plan['files']]
assert len(paths) == len(set(paths)) == 26
for name in paths:
    rel = pathlib.PurePosixPath(name)
    assert not rel.is_absolute() and '..' not in rel.parts
    assert name in ('AGENTS.md', 'MANIFEST.sha256', '.github/workflows/acceptance.yml') or rel.parts[0] in ('apps', 'packages', 'prisma', 'scripts', 'tests', 'docs', 'artifacts')
    target = root / name
    assert all(not parent.is_symlink() for parent in (target, *target.parents))

sha = lambda b: hashlib.sha256(b).hexdigest()
for entry in plan['files']:
    p = root / entry['path']
    actual = sha(p.read_bytes()) if p.exists() else None
    assert actual == entry['before'], 'Baseline mismatch: ' + entry['path']

parts = []
assert len(plan['parts']) == 18
for i, entry in enumerate(plan['parts']):
    assert entry['i'] == i
    # Correct a known JSX whitespace transcription before comparing exact reviewed hashes.
    data = (root / f'.agent/h1/part-{i}.patch').read_bytes().replace(b'/ >', b'/>')
    git_blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    assert len(data) == entry['size'] and git_blob == entry['blob'], f'Patch part mismatch: {i}'
    parts.append(data)
patch = b''.join(parts)
assert len(patch) == 130636
assert sha(patch) == plan['patch_sha256'] == '58ef60901dfa9adc4af361853924972a7f0d7eae980036bfd2a32f37daf96b3a'
with tempfile.NamedTemporaryFile() as f:
    f.write(patch)
    f.flush()
    subprocess.run(['git', 'apply', '--check', '--unidiff-zero', f.name], check=True)
    subprocess.run(['git', 'apply', '--index', '--unidiff-zero', f.name], check=True)
for entry in plan['files']:
    assert sha((root / entry['path']).read_bytes()) == entry['after'], 'Result mismatch: ' + entry['path']
changed = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '-z']).decode().split('\0')
assert set(filter(None, changed)) == set(paths) - {'.github/workflows/acceptance.yml'}
subprocess.run(['git', 'diff', '--cached', '--check'], check=True)
print('H1 materialization verified: 26 exact file hashes; 25 applied changes plus pre-seated CI workflow.')
