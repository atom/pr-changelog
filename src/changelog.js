require("babel-polyfill")

let Promise = require("bluebird")
let GithubApi = require('github')
let moment = require('moment')
let paginator = require('./paginator')
let spawnSync = require('child_process').spawnSync;
let {filter, clone} = require('./utils')
let Logger = require('./logger')

let github = new GithubApi({
  version: '3.0.0',
  timeout: 10000,
  protocol: 'https'
});

Promise.promisifyAll(github.repos);
Promise.promisifyAll(github.issues);
Promise.promisifyAll(github.pullRequests);

let githubAccessToken
function setGithubAccessToken (token) {
  githubAccessToken = token
}

function authenticate() {
  github.authenticate({
    type: "oauth",
    token: githubAccessToken || process.env['GITHUB_ACCESS_TOKEN']
  });
}

/*
  Commits
*/

async function getCommitDiff({owner, repo, base, head, localClone}) {
  let commits
  if (localClone) {
    commits = getCommitDiffLocal({owner, repo, base, head, localClone})
    if (commits) {
      Logger.log('Found', commits.length, 'local commits');
    } else {
      Logger.warn(`Cannot fetch local commit diff, cannot find local copy of ${owner}/${repo}`);
    }
  }

  if (!commits) {
    commits = await getCommitDiffRemote({owner, repo, base, head})
  }

  return formatCommits(commits)
}

// Get the tag diff locally
function getCommitDiffLocal({owner, repo, base, head, localClone}) {
  let gitDirParams = ['--git-dir', `${localClone}/.git`, '--work-tree', localClone]

  let remote = spawnSync('git', gitDirParams.concat(['config', '--get', 'remote.origin.url'])).stdout.toString()
  if (remote.indexOf(`:${owner}/${repo}.git`) < 0 || remote.indexOf(`/${owner}/${repo}.git`) < 0)
    return null

  let commitRegex = /([\da-f]+) ([\d]+) (.+)/
  let commitStrings = spawnSync('git', gitDirParams.concat(['log', '--format="%H %ct %s"', `${base}...${head}`])).stdout.toString().trim().split('\n')
  let commits = commitStrings.map((commitString) => {
    let match = commitString.match(commitRegex)
    if (match) {
      let [__, sha, timestamp, summary] = match
      return {sha: sha, summary: summary, date: moment.unix(timestamp)}
    }
    return null
  })

  return commits
}

async function getCommitDiffRemote({owner, repo, base, head}) {
  authenticate()

  // Fetch comparisons recursively until we don't find any commits
  // This is because the GitHub API limits the number of commits returned in
  // a single response.
  let commits = []
  let compareHead = head
  while (true) {
    const compareResult = await github.repos.compareCommitsAsync({
      user: owner,
      repo: repo,
      base: base,
      head: compareHead
    })
    if (compareResult.total_commits === 0) break
    commits = compareResult.commits.concat(commits)
    compareHead = commits[0].sha + '^'
  }

  Logger.log(`Found ${commits.length} commits from the GitHub API for ${owner}/${repo}`);
  return commits
}

function formatCommits(commits) {
  let commitsResult = []
  let shas = {}
  for (let commit of commits) {
    if (!commit) continue;
    if (shas[commit.sha]) continue;
    shas[commit.sha] = true
    if (commit.summary)
      commitsResult.push(commit)
    else
      commitsResult.push({
        sha: commit.sha,
        summary: commit.commit.message.split('\n')[0],
        message: commit.commit.message,
        date: moment(commit.commit.committer.date),
        author: commit.commit.author.name
      })
  }
  commitsResult.sort((a, b) => {
    if (a.date.isBefore(b.date))
      return -1
    else if (b.date.isBefore(a.date))
      return 1
    return 0
  })
  return commitsResult
}

/*
  Pull Requests
*/

async function getPullRequest({owner, repo, number}) {
  authenticate()
  try {
    return await github.pullRequests.getAsync({
      user: owner,
      repo: repo,
      number: number
    })
  }
  catch (e) {
    Logger.warn('Cannot find PR', `${owner}/${repo}#${number}`, e.code, e.message)
    return null
  }
}

async function getPullRequestsBetweenDates({owner, repo, fromDate, toDate}) {
  authenticate()
  let options = {
    user: owner,
    repo: repo,
    state: 'closed',
    sort: 'updated',
    direction: 'desc'
  }

  let mergedPRs = await paginator(options, (options) => {
    return github.pullRequests.getAllAsync(options)
  }, (prs) => {
    prs = filter(prs, (pr) => {
      return !!pr.merged_at
    })
    if (prs.length == 0) return prs

    prs = filter(prs, (pr) => {
      return fromDate.isBefore(moment(pr.merged_at))
    })

    // stop pagination when there are no PRs earlier than this
    if (prs.length == 0) return null

    return prs
  })

  mergedPRs = filter(mergedPRs, (pr) => {
    return toDate.isAfter(moment(pr.merged_at))
  })

  return formatPullRequests(mergedPRs)
}

function filterPullRequestCommits(commits) {
  let prRegex = /Merge pull request #(\d+)/
  let filteredCommits = []

  for (let commit of commits) {
    let match = commit.summary.match(prRegex)
    if (!match) continue;

    // TODO: not ideal jamming these properties on the object
    commit.prNumber = match[1]
    filteredCommits.push(commit)
  }

  return filteredCommits
}

function formatPullRequests(pullRequests) {
  let pullRequestsResult = []
  for (let pullRequest of pullRequests) {
    if (pullRequest.htmlURL)
      pullRequestsResult.push(pullRequest)
    else
      pullRequestsResult.push({
        number: pullRequest.number,
        title: pullRequest.title,
        htmlURL: pullRequest.html_url,
        mergedAt: moment(pullRequest.merged_at),
        author: pullRequest.user.login,
        repoName: pullRequest.base.repo.full_name
      })
  }
  pullRequestsResult.sort((a, b) => {
    if (a.mergedAt.isBefore(b.mergedAt))
      return -1
    else if (b.mergedAt.isBefore(a.mergedAt))
      return 1
    return 0
  })
  return pullRequestsResult
}

function pullRequestsToString(pullRequests) {
  let pullRequestStrings = []
  for (let pullRequest of pullRequests) {
    pullRequestStrings.push(`* [${pullRequest.repoName}#${pullRequest.number} - ${pullRequest.title}](${pullRequest.htmlURL})`)
  }
  return pullRequestStrings.join('\n')
}

function defaultChangelogFormatter({pullRequests, owner, repo, fromTag, toTag}) {
  let changelog = pullRequestsToString(pullRequests)
  let title = repo
  if (repo == 'atom')
    title = 'Atom Core'
  return `### [${title}](https://github.com/${owner}/${repo})\n\n${fromTag}...${toTag}\n\n${changelog}`
}

async function getFormattedPullRequests({owner, repo, fromTag, toTag, localClone, changelogFormatter}) {
  Logger.log('Comparing', `${owner}/${repo}`, `${fromTag}...${toTag}`);
  if (localClone) Logger.log('Local clone of repo', localClone);

  if (!changelogFormatter) {
    Logger.warn('A `changelogFormatter` must be specified!')
    return ''
  }

  if (repo !== 'atom' && fromTag.startsWith('vfile:.')) {
    // This case will occur when an Atom package has been consolidated into atom/atom
    // for more than one release.  pr-changelog doesn't apply here because all PRs
    // for this package will show up against Atom Core
    Logger.warn(`Package '${repo}' uses local package path, skipping...`)
    return ''
  }

  if (repo !== 'atom' && toTag.startsWith('vfile:.')) {
    // This case will occur when an Atom package has been consolidated into atom/atom
    // between the prior and current releases.  Since we can't easily compute changes
    // to the standalone package compared to what's currently in the atom/atom repo,
    // let's choose the last published version for the package to get as much info
    // as we can.
    Logger.log(`Package '${repo}' uses local package path, comparing against last published tag...`)
    let releaseTags = await github.repos.getTagsAsync({user: owner, repo})
    if (releaseTags && releaseTags.length > 0 && releaseTags[0].name !== fromTag) {
      toTag = releaseTags[0].name
      Logger.log(`Package '${repo}'s last release was ${toTag}, comparing against that`)
    } else {
      Logger.log(`Package '${repo}' has not changed since the last Atom release, skipping it...`)
      return ''
    }
  }

  let commits = await getCommitDiff({
    owner: owner,
    repo: repo,
    base: fromTag,
    head: toTag,
    localClone: localClone
  })

  if (commits.length == 0) {
    return ''
  }

  let firstCommit = commits[0]
  let lastCommit = commits[commits.length - 1]
  let fromDate = firstCommit.date
  let toDate = lastCommit.date

  Logger.log(`Fetching PRs between dates ${fromDate.toISOString()} ${toDate.toISOString()} for ${owner}/${repo}`);
  let pullRequests = await getPullRequestsBetweenDates({
    owner: owner,
    repo: repo,
    fromDate: fromDate,
    toDate: toDate
  })
  Logger.log(`Found ${pullRequests.length} merged PRs for ${owner}/${repo}`);

  let prCommits = filterPullRequestCommits(commits)
  let filteredPullRequests = []
  let pullRequestsByNumber = {}

  for (let pr of pullRequests)
    pullRequestsByNumber[pr.number] = pr

  for (let commit of prCommits) {
    if (pullRequestsByNumber[commit.prNumber]) {
      filteredPullRequests.push(pullRequestsByNumber[commit.prNumber])
    }
    else if (fromDate.toISOString() == toDate.toISOString()){
      Logger.log(`${owner}/${repo}#${commit.prNumber} not in date range, fetching explicitly`)
      let pullRequest = await getPullRequest({owner, repo, number: commit.prNumber})
      if (pullRequest)
        filteredPullRequests.push(pullRequest)
      else
        Logger.warn(`${owner}/${repo}#${commit.prNumber} not found! Commit text: ${commit.summary}`)
    }
    else {
      Logger.log(`${owner}/${repo}#${commit.prNumber} not in date range, likely a merge commit from a fork-to-fork PR`)
    }
  }

  pullRequests = formatPullRequests(filteredPullRequests)

  if (pullRequests.length) {
    return changelogFormatter({
      owner: owner,
      repo: repo,
      fromTag: fromTag,
      toTag: toTag,
      pullRequests: pullRequests
    })
  }
  else
    return ''
}

/*
  Generating changelog from child packages
*/

async function getFormattedPullRequestsForDependencies({owner, repo, fromTag, toTag, dependencyKey, changelogFormatter}) {
  let options, fromRefContent, toRefContent, changedDependencies
  let resultList = []
  let contentOptions = {
    user: owner,
    repo: repo,
    path: 'package.json'
  }

  Logger.log(`\nGenerating dependency changelog for '${dependencyKey}' on ${owner}/${repo}`)

  function getContent(results) {
    return new Buffer(results.content, results.encoding).toString('utf-8')
  }

  function getDependencies(packageJSON) {
    let json = JSON.parse(packageJSON)
    return json[dependencyKey]
  }

  function getChangedDependencies(fromPackageJSONStr, toPackageJSONStr) {
    let changedDependencies = {}
    let fromDeps = getDependencies(fromPackageJSONStr)
    let toDeps = getDependencies(toPackageJSONStr)

    for (let packageName in fromDeps) {
      if (fromDeps[packageName] != toDeps[packageName]) {
        changedDependencies[packageName] = {
          // Tags are prefixed with the `v`, not an ideal solution
          fromRef: fromDeps[packageName] ? `v${fromDeps[packageName]}` : null,
          toRef: toDeps[packageName] ? `v${toDeps[packageName]}` : null
        }
      }
    }

    return changedDependencies
  }

  // get old package.json
  authenticate()
  options = clone(contentOptions)
  options.ref = fromTag
  fromRefContent = github.repos.getContentAsync(options)

  // get new package.json
  authenticate()
  options = clone(contentOptions)
  options.ref = toTag
  toRefContent = github.repos.getContentAsync(options)

  try {
    fromRefContent = getContent(await fromRefContent)
    toRefContent = getContent(await toRefContent)
  }
  catch (e) {
    Logger.log("Cannot get package.json content:", e.message || e)
    return ''
  }

  const results = []
  changedDependencies = getChangedDependencies(fromRefContent, toRefContent)
  for (let packageName in changedDependencies) {
    let {fromRef, toRef} = changedDependencies[packageName]
    if (fromRef && toRef) {
      results.push(await getFormattedPullRequests({
        owner: owner,
        repo: packageName,
        fromTag: fromRef,
        toTag: toRef,
        changelogFormatter: changelogFormatter
      }))
    }
  }

  return results.join('\n')
}

async function getChangelog(options) {
  const promises = [getFormattedPullRequests(options)]
  if (options.dependencyKey)
    promises.push(getFormattedPullRequestsForDependencies(options))

  const results = await Promise.all(promises)
  return results.join('\n\n')
}

module.exports = {
  getChangelog: getChangelog,
  pullRequestsToString: pullRequestsToString,
  defaultChangelogFormatter: defaultChangelogFormatter,
  setGithubAccessToken: setGithubAccessToken
}
