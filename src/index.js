require("babel-polyfill")

var Promise = require("bluebird")
var GithubApi = require('github')
var moment = require('moment')
var paginator = require('./paginator')

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

// * `tagNames` - ['v1.1.0', 'v1.2.0']
async function getTags(tagNames) {
  authenticate()
  let tags = await github.repos.getTagsAsync({
    user: owner,
    repo: repo
  })

  let tagsToFetch = []
  for (let tagName of tagNames) {
    for (let tag of tags) {
      if (tagName == tag.name)
        tagsToFetch.push(tag)
    }
  }

  let promises = tagsToFetch.map((tag) => {
    return github.repos.getCommitAsync({
      user: owner,
      repo: repo,
      sha: tag.commit.sha
    })
  })

  let tagsToReturn = []
  for (let i = 0; i < promises.length; i++) {
    let promise = promises[i]
    let commit = await promise
    tagsToReturn.push({
      name: tagNames[i],
      sha: commit.sha,
      date: moment(commit.commit.committer.date)
    })
  }

  return tagsToReturn
}

async function getIssuesAndPullRequestsBetweenDates(fromDate, toDate) {
  authenticate()
  let options = {
    user: owner,
    repo: repo,
    state: 'closed',
    sort: 'updated',
    direction: 'desc',
    since: fromDate.toISOString()
  }
  let rawIssues = await paginator(options, (options) => { return github.issues.repoIssuesAsync(options) })

  let issues = []
  let pullRequests = []

  for (let issue of rawIssues) {
    let closedDate = moment(issue.closed_at)
    if (closedDate.isBefore(toDate)) {
      if (issue.pull_request.url)
        pullRequests.push(issue)
      else
        issues.push(issue)
    }
  }

  console.log(pullRequests.length, issues.length);

  authenticate()
  options = {
    user: owner,
    repo: repo,
    number: pullRequests[0].number
  }
  let pr = await github.pullRequests.get(options)
  console.log('ISSUE', pullRequests[0]);
  console.log('PR', pr);

  return {issues: issues, pullRequests: pullRequests}
}

async function getPullRequestsBetweenDates(fromDate, toDate) {
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

// This will only return 250 commits
// git log --pretty=oneline v1.2.0-beta3...v1.3.0-beta7
async function compareCommits({base, head}) {
  authenticate()
  let options = {
    user: owner,
    repo: repo,
    base: base,
    head: head
  }

  let compareView = await github.repos.compareCommitsAsync(options)
  console.log(compareView.total_commits);
  let commits = compareView.commits
  return formatCommits(commits)
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

async function run() {
  let tags = await getTags([fromTag, toTag])

  let commits = await compareCommits({base: tags[0].sha, head: tags[1].sha})
  let firstCommit = commits[0]
  let lastCommit = commits[commits.length - 1]

  let fromDate = firstCommit.date
  let toDate = lastCommit.date
  let pullRequests = await getPullRequestsBetweenDates(fromDate, toDate)

  pullRequests = filterPullRequestsByCommits(pullRequests, commits)
  console.log(pullRequestsToString(pullRequests));
}

run().then(() => {
  console.log('DONE');
}).catch((err) => {
  console.log('!!', err.stack || err);
})






function filter(arr, func) {
  let newArr = []
  for (let obj of arr)
    if (func(obj))
      newArr.push(obj)
  return newArr
}

function formatCommits(commits) {
  let commitsResult = []
  let shas = {}
  for (let commit of commits) {
    if (shas[commit.sha]) continue;
    shas[commit.sha] = true
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
