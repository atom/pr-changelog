# pr-changelog

A command line utility to generate a PR changelog between two refs. The resulting changelog looks like:

```md
## atom/atom
​
v1.2.4...v1.3.0
​
* [atom/atom#9383 - Fix incorrectly reported width when measuring lines](https://github.com/atom/atom/pull/9383) on November 2nd 2015
* [atom/atom#9024 - Add TextEditor.getUniqueTitle()](https://github.com/atom/atom/pull/9024) on November 2nd 2015
* [atom/atom#9318 - Introduce NativeCompileCache](https://github.com/atom/atom/pull/9318) on November 3rd 2015
* [atom/atom#9104 - autoindent lines with moveLineUp/moveLineDown](https://github.com/atom/atom/pull/9104) on November 3rd 2015
* [atom/atom#8442 - Enable Portable Mode](https://github.com/atom/atom/pull/8442) on November 3rd 2015
```

## Usage

`npm install -g pr-changelog`

This relies on the GitHub API; you should [create an API token](https://help.github.com/articles/creating-an-access-token-for-command-line-use/), and place it in the `GITHUB_ACCESS_TOKEN` environment variable. It needs `public_repo` access if your repo is public, and `repo` access if your repo is private.

### CLI

This project was written for [Atom](http://atom.io), and as such there are a couple atomisms baked in. e.g. By default it will generate an Atom changelog.

Generate an Atom changelog, including package changelogs:

```
pr-changelog -v -P -l ~/github/atom v1.2.4...v1.3.0 > changelog.md
```

Generate a changelog for your own repo:

```
pr-changelog -v --r omgme/myrepo v0.9.0...v1.0.0 > changelog.md
```

This will compare the tags via the GitHub API. The downside with this approach is that it is slower, and only returns 250 commits in the diff. If there are more, you should specify the local repo via the `-l` / `--local-clone` switch (make sure the local repo is up to date!).

```
pr-changelog -v -r omgme/myrepo -l ~/path/to/myrepo v0.9.0...v1.0.0 > changelog.md
```

### In another script

```js
let Changelog = require('pr-changelog')
Changelog.getChangelog({
  owner: 'atom',
  repo: 'find-and-replace',
  fromTag: 'v1.0.0',
  toTag: 'v1.4.0',
  localClone: '~/github/find-and-replace', // optional
  changelogFormatter: Changelog.defaultChangelogFormatter // any formatter
}).then(function(output) {
  console.log(output);
}).catch(function(err) {
  console.error('error', err.stack || err);
})
```

There are 3 functions exported:

```js
{ getChangelog, pullRequestsToString, defaultChangelogFormatter }
```

You can write your own formatter:

```js
let Changelog = require('pr-changelog')
function myChangelogFormatter({pullRequests, owner, repo, fromTag, toTag}) {
  // pullRequestsToString returns a bulleted markdown list of PRs
  let changelog = Changelog.pullRequestsToString(pullRequests)

  // This is the default, but do whatever you want!
  return `## ${owner}/${repo}\n\n${fromTag}...${toTag}\n\n${changelog}`
}
```

## Approach

There are a number of changelog generator projects out there. The downside of most approaches is that they use dates to bucket the commits or PRs into a tag or ref. Atom uses a [release system](http://blog.atom.io/2015/10/21/introducing-the-atom-beta-channel.html) similar to Chrome with stable, beta, and a development channels, so date bucketing does not work.

This project diffs the commits between the specified refs, looks for merge commits, and finds the PRs associated with those merge commits.

Additionally, with the `-P` flag, it fetches the package.json from each ref, compares the `packageDependencies` key, and runs the changelog generation on all the changed packages.
