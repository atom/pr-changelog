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

var fromTag = 'v1.1.0'
var toTag = 'v1.2.0'
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
  let issueOptions = {
    user: owner,
    repo: repo,
    state: 'closed',
    sort: 'updated',
    direction: 'desc',
    since: fromDate.toISOString()
  }
  let rawIssues = await paginator(issueOptions, (options) => { return github.issues.repoIssuesAsync(options) })

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

  console.log(rawIssues.length, issues.length + pullRequests.length, issues.length, pullRequests.length);
}



async function run() {
  let tags = await getTags([fromTag, toTag])
  console.log(tags);
  let issues = await getIssuesAndPullRequestsBetweenDates(tags[0].date, tags[1].date)
}

run().then(() => {
  console.log('DONE');
}).catch((err) => {
  console.log('!!', err.stack);
})
