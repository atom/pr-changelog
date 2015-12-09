require("babel-polyfill")

var Promise = require("bluebird")
var GithubApi = require('github')
var moment = require('moment')

var argv = require('yargs').argv;

var github = new GithubApi({
  version: '3.0.0',
  timeout: 10000,
  protocol: 'https'
});

Promise.promisifyAll(github.gitdata);
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

getTags([fromTag, toTag]).then((tags) =>{
  console.log(tags);
}).catch((err) => {
  console.log(err.stack);
})
