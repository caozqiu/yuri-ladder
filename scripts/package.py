from pathlib import Path
import hashlib
import json
import zipfile
import argparse
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('--edition', default='')
parser.add_argument('--compiled-zip', type=Path)
args = parser.parse_args()
edition = args.edition + '_' if args.edition else ''

root = Path(__file__).resolve().parents[1]
outputs = root.parents[1] / 'outputs'
outputs.mkdir(exist_ok=True)

def archive(path, files):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for file, name in sorted(files, key=lambda x: str(x[1])):
            z.write(file, str(name).replace('\\', '/'))
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
    return {'file': path.name, 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

upload_path = outputs / f'尤复天梯观察站_{edition}EdgeOne上传包.zip'
if args.compiled_zip:
    with zipfile.ZipFile(args.compiled_zip) as compiled:
        assert compiled.testzip() is None
        assert {'assets/index.html', 'edge-functions/config.json', 'edge-functions/index.js'} <= set(compiled.namelist())
        assert not any(name.startswith('/') or '..' in Path(name).parts for name in compiled.namelist())
    shutil.copyfile(args.compiled_zip, upload_path)
    upload = {'file': upload_path.name, 'bytes': upload_path.stat().st_size,
              'sha256': hashlib.sha256(upload_path.read_bytes()).hexdigest()}
else:
    upload = archive(upload_path,
                     [(p, p.relative_to(root / 'dist')) for p in (root / 'dist').rglob('*') if p.is_file()])
folders = ['shared', 'src', 'web', 'vendor', 'migrations', 'scripts', 'tests', '.github', 'dist']
files = []
for folder in folders:
    files.extend((p, p.relative_to(root)) for p in (root / folder).rglob('*') if p.is_file() and p.name != 'site.css')
for name in ['package.json', 'package-lock.json', 'edgeone.json', 'build.mjs', '.gitignore',
             'README.md', 'THIRD_PARTY_NOTICES.txt', '启动预览.cmd', 'verification.json']:
    files.append((root / name, Path(name)))
files.append((root / 'collector/collector.mjs', Path('collector/collector.mjs')))
files.extend((p, p.relative_to(root)) for p in (root / 'collector/migrations').rglob('*') if p.is_file())
source = archive(outputs / f'尤复天梯观察站_{edition}源码及预览.zip', files)
assert not any('.checkpoint' in str(name) or 'node_modules' in str(name) for _, name in files)
(outputs / f'{edition}包_SHA256.json').write_text(json.dumps([upload, source], ensure_ascii=False, indent=2), encoding='utf-8')
(outputs / f'{edition}验收.json').write_text((root / 'verification.json').read_text(encoding='utf-8'), encoding='utf-8')
(outputs / f'{edition}运行说明.md').write_text((root / 'README.md').read_text(encoding='utf-8'), encoding='utf-8')
print(json.dumps([upload, source], ensure_ascii=False))
