const {execFileSync} = require('node:child_process');
const git = args => execFileSync('git', args, {encoding:'utf8'}).trim();
const write = args => execFileSync('git', args, {stdio:'inherit'});

const projects = ['gitee.com/a1meon_admin/qingtu', 'github.com/a1meon/qingtu'];
function projectOf(url) {
  return url.replace(/^(https:\/\/|ssh:\/\/git@|git@)/, '').replace(':', '/').replace(/\.git\/?$/, '');
}
function sync(args) {
  const commit = args[0] === '--commit';
  const tag = args[0] === '--tag' && args[1];
  if (!commit && args.length && !(args.length === 2 && /^v\d+\.\d+\.\d+$/.test(tag))) {
    throw new Error('用法：git:sync [--tag vX.Y.Z] 或 git:commit -- -m "提交说明"');
  }
  const branch = git(['symbolic-ref', '--short', 'HEAD']);
  if (commit) write(['commit', ...args.slice(1)]);
  const refs = ['refs/heads/' + branch];
  if (tag) {
    if (git(['rev-parse', 'refs/tags/' + tag + '^{commit}']) !== git(['rev-parse', 'HEAD'])) throw new Error('发行标签与当前提交不一致');
    refs.push('refs/tags/' + tag);
  }
  const expected = refs.map(ref => git(['rev-parse', ref]));
  const remotes = git(['remote']).split(/\r?\n/).filter(Boolean).map(name => ({
    name, fetch:git(['remote','get-url',name]), push:git(['remote','get-url','--push','--all',name]).split(/\r?\n/)
  }));
  const failures = [];
  for (const project of projects) {
    const https = 'https://' + project + '.git';
    const remote = remotes.find(r => r.push.length === 1 && projectOf(r.push[0]) === project && projectOf(r.fetch) === project);
    const candidates = [remote?.name || https];
    if (remote && !remote.push[0].startsWith('https:')) candidates.push(https);
    let verified = false;
    for (const target of candidates) {
      try {
        write(['push', '--no-follow-tags', target, ...refs.map((ref, i) => expected[i] + ':' + ref)]);
        const actual = new Map(git(['ls-remote','--refs',target,...refs]).split(/\r?\n/).map(line => line.split(/\s+/).reverse()));
        if (refs.some((ref,i) => actual.get(ref) !== expected[i])) throw new Error('远端提交校验失败');
        verified = true;
        console.log(project + '  ' + branch + '  ' + expected[0]);
        break;
      } catch (error) { if (!error.status) console.error(error.message); }
    }
    if (!verified) failures.push(project);
  }
  if (failures.length) throw new Error('尚未同步到 ' + failures.join('、') + '。修复权限或分支分歧后重新运行 git:sync。');
}
if (require.main === module) {
  try { sync(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
