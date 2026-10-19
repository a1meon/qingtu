import test from 'node:test';import assert from 'node:assert/strict';import {formalReleaseFromPage} from '../engine/update-discovery.mjs';
const base='https://gitee.com/a1meon_admin/halframe-releases/';
test('public latest discovery binds the formal badge to an exact same-repository stable tag',()=>{
 const header=href=>`<div class='release-header-main'><a href='${href}'>release</a><div class='latest-version'>latest</div></div><div class='release-header-actions'>`;
 assert.equal(formalReleaseFromPage(header('/a1meon_admin/halframe-releases/releases/tag/v0.5.4'),base).base,base+'releases/download/v0.5.4/');
 for(const href of ['https://evil.test/a1meon_admin/halframe-releases/releases/tag/v9.0.0','/someone/other/releases/tag/v9.0.0','/a1meon_admin/halframe-releases/releases/tag/v9.0.0-beta','/a1meon_admin/halframe-releases/releases/tag/v9.0.0?fake'])assert.throws(()=>formalReleaseFromPage(header(href),base));
 assert.throws(()=>formalReleaseFromPage(header('/a1meon_admin/halframe-releases/releases/tag/v0.5.5').replace('latest-version','prerelease'),base));
 assert.throws(()=>formalReleaseFromPage('403 Forbidden (Rate Limit Exceeded)',base));
});
