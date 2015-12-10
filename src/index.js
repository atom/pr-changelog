require("babel-polyfill")

var Promise = require("bluebird")
var GithubApi = require('github')
var moment = require('moment')
var paginator = require('./paginator')
var spawnSync = require('child_process').spawnSync;
var {filter} = require('./utils')

var argv = require('yargs').argv;

var github = new GithubApi({
  version: '3.0.0',
  timeout: 10000,
  protocol: 'https'
});

Promise.promisifyAll(github.repos);
Promise.promisifyAll(github.issues);
Promise.promisifyAll(github.pullRequests);

function authenticate() {
  github.authenticate({
    type: "oauth",
    token: process.env['GITHUB_ACCESS_TOKEN']
  });
}

var fromTag = 'v1.2.0-beta0'
var toTag = 'v1.3.0-beta7'
var owner = 'atom'
var repo = 'atom'

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

// Get the tag diff locally
function compareCommitsLocal({owner, repo, base, head}) {
  let gitDirParams = ['--git-dir', '/Users/ben/github/atom/.git', '--work-tree', '/Users/ben/github/atom']

  let remote = spawnSync('git', gitDirParams.concat(['config', '--get', 'remote.origin.url'])).stdout.toString()
  if (remote.indexOf(`:${owner}/${repo}.git`) < 0)
    return null

  let commitRegex = /([\da-f]+) ([\d]+) (.+)/
  let commitStrings = spawnSync('git', gitDirParams.concat(['log', '--format="%H %ct %s"', `${base}...${head}`])).stdout.toString().trim().split('\n')
  let commits = commitStrings.map((commitString) => {
    let match = commitString.match(commitRegex)
    let [__, sha, timestamp, summary] = match
    return {sha: sha, summary: summary, date: moment.unix(timestamp)}
  })

  return formatCommits(commits)
}

// This will only return 250 commits when using the API
async function compareCommits({owner, repo, base, head, checkLocal}) {
  let commits
  if (checkLocal) {
    commits = compareCommitsLocal({owner, repo, base, head})
    if (commits) {
      console.log('Found', commits.length, 'local commits');
      return commits
    }
    else
      console.log(`Cannot fetch local commit diff, cannot find local copy of ${owner}/${repo}`);
  }

  authenticate()
  let options = {
    user: owner,
    repo: repo,
    base: base,
    head: head
  }

  let compareView = await github.repos.compareCommitsAsync(options)
  return formatCommits(compareView.commits)
}

function filterPullRequestsByCommits(pullRequests, commits) {
  let prRegex = /Merge pull request #(\d+)/
  let filteredPullRequests = []
  let pullRequestsByNumber = {}

  for (let pr of pullRequests) {
    pullRequestsByNumber[pr.number] = pr
  }

  for (let commit of commits) {
    let match = commit.summary.match(prRegex)
    if (!match) continue;

    let prNumber = match[1]
    if (pullRequestsByNumber[prNumber])
      filteredPullRequests.push(pullRequestsByNumber[prNumber])
    else
      console.log('no PR for', prNumber, commit.summary);
  }

  return filteredPullRequests
}

async function getFormattedPullRequestsBetweenTags({owner, repo, fromTag, toTag, checkLocal}) {
  let commits = await compareCommits({
    owner: owner,
    repo: repo,
    base: fromTag,
    head: toTag,
    checkLocal: checkLocal
  })
  let firstCommit = commits[0]
  let lastCommit = commits[commits.length - 1]
  let fromDate = firstCommit.date
  let toDate = lastCommit.date

  console.log("Fetching PRs between dates", fromDate.toISOString(), toDate.toISOString());
  let pullRequests = await getPullRequestsBetweenDates({
    owner: owner,
    repo: repo,
    fromDate: fromDate,
    toDate: toDate
  })
  console.log("Found", pullRequests.length, "merged PRs");

  pullRequests = filterPullRequestsByCommits(pullRequests, commits)
  return pullRequestsToString(pullRequests)
}

getFormattedPullRequestsBetweenTags({
  owner: owner,
  repo: repo,
  fromTag: fromTag,
  toTag: toTag,
  checkLocal: true
}).then((output) => {
  console.log(output);
}).catch((err) => {
  console.log('error', err.stack || err);
})





function formatCommits(commits) {
  let commitsResult = []
  let shas = {}
  for (let commit of commits) {
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

function commitsToString(commits) {
  let commitStrings = []
  for (let commit of commits) {
    commitStrings.push(`${commit.sha} ${commit.author} ${commit.summary}`)
  }
  return commitStrings.join('\n')
}

function formatPullRequests(pullRequests) {
  let pullRequestsResult = []
  for (let pullRequest of pullRequests) {
    pullRequestsResult.push({
      number: pullRequest.number,
      title: pullRequest.title,
      htmlURL: pullRequest.html_url,
      mergedAt: moment(pullRequest.merged_at),
      author: pullRequest.user.login
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
    pullRequestStrings.push(`[${pullRequest.title}](${pullRequest.htmlURL}) - ${pullRequest.mergedAt.format('MMMM Do YYYY, h:mma')}`)
  }
  return pullRequestStrings.join('\n')
}
