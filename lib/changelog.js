'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _require = require('@octokit/rest'),
    Octokit = _require.Octokit;

var moment = require('moment');
var paginator = require('./paginator');
var spawnSync = require('child_process').spawnSync;

var _require2 = require('./utils'),
    filter = _require2.filter,
    clone = _require2.clone;

var Logger = require('./logger');

var github = void 0;

var githubAccessToken = void 0;
function setGithubAccessToken(token) {
  githubAccessToken = token;
}

function authenticate() {
  return regeneratorRuntime.async(function authenticate$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          github = new Octokit({
            auth: githubAccessToken || process.env['GITHUB_ACCESS_TOKEN']
          });

        case 1:
        case 'end':
          return _context.stop();
      }
    }
  }, null, this);
}

/*
  Commits
*/

function getCommitDiff(_ref) {
  var owner = _ref.owner,
      repo = _ref.repo,
      base = _ref.base,
      head = _ref.head,
      localClone = _ref.localClone;
  var commits;
  return regeneratorRuntime.async(function getCommitDiff$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          commits = void 0;

          if (localClone) {
            commits = getCommitDiffLocal({ owner: owner, repo: repo, base: base, head: head, localClone: localClone });
            if (commits) {
              Logger.log('Found', commits.length, 'local commits');
            } else {
              Logger.warn('Cannot fetch local commit diff, cannot find local copy of ' + owner + '/' + repo);
            }
          }

          if (commits) {
            _context2.next = 6;
            break;
          }

          _context2.next = 5;
          return regeneratorRuntime.awrap(getCommitDiffRemote({ owner: owner, repo: repo, base: base, head: head }));

        case 5:
          commits = _context2.sent;

        case 6:
          return _context2.abrupt('return', formatCommits(commits));

        case 7:
        case 'end':
          return _context2.stop();
      }
    }
  }, null, this);
}

// Get the tag diff locally
function getCommitDiffLocal(_ref2) {
  var owner = _ref2.owner,
      repo = _ref2.repo,
      base = _ref2.base,
      head = _ref2.head,
      localClone = _ref2.localClone;

  var gitDirParams = ['--git-dir', localClone + '/.git', '--work-tree', localClone];

  var remote = spawnSync('git', gitDirParams.concat(['config', '--get', 'remote.origin.url'])).stdout.toString();
  if (remote.indexOf(':' + owner + '/' + repo + '.git') < 0 || remote.indexOf('/' + owner + '/' + repo + '.git') < 0) return null;

  var commitRegex = /([\da-f]+) ([\d]+) (.+)/;
  var commitStrings = spawnSync('git', gitDirParams.concat(['log', '--format="%H %ct %s"', base + '...' + head])).stdout.toString().trim().split('\n');
  var commits = commitStrings.map(function (commitString) {
    var match = commitString.match(commitRegex);
    if (match) {
      var _match = _slicedToArray(match, 4),
          __ = _match[0],
          sha = _match[1],
          timestamp = _match[2],
          summary = _match[3];

      return { sha: sha, summary: summary, date: moment.unix(timestamp) };
    }
    return null;
  });

  return commits;
}

function getCommitDiffRemote(_ref3) {
  var owner = _ref3.owner,
      repo = _ref3.repo,
      base = _ref3.base,
      head = _ref3.head;
  var commits, compareHead, compareResult;
  return regeneratorRuntime.async(function getCommitDiffRemote$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          authenticate();

          // Fetch comparisons recursively until we don't find any commits
          // This is because the GitHub API limits the number of commits returned in
          // a single response.
          commits = [];
          compareHead = head;

        case 3:
          if (!true) {
            _context3.next = 13;
            break;
          }

          _context3.next = 6;
          return regeneratorRuntime.awrap(github.rest.repos.compareCommits({
            owner: owner,
            repo: repo,
            base: base,
            head: compareHead
          }));

        case 6:
          compareResult = _context3.sent;

          if (!(compareResult.data.total_commits === 0)) {
            _context3.next = 9;
            break;
          }

          return _context3.abrupt('break', 13);

        case 9:
          commits = compareResult.data.commits.concat(commits);
          compareHead = commits[0].sha + '^';
          _context3.next = 3;
          break;

        case 13:

          Logger.log('Found ' + commits.length + ' commits from the GitHub API for ' + owner + '/' + repo);
          return _context3.abrupt('return', commits);

        case 15:
        case 'end':
          return _context3.stop();
      }
    }
  }, null, this);
}

function formatCommits(commits) {
  var commitsResult = [];
  var shas = {};
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = commits[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var commit = _step.value;

      if (!commit) continue;
      if (shas[commit.sha]) continue;
      shas[commit.sha] = true;
      if (commit.summary) commitsResult.push(commit);else commitsResult.push({
        sha: commit.sha,
        summary: commit.commit.message.split('\n')[0],
        message: commit.commit.message,
        date: moment(commit.commit.committer.date),
        author: commit.commit.author.name
      });
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  commitsResult.sort(function (a, b) {
    if (a.date.isBefore(b.date)) return -1;else if (b.date.isBefore(a.date)) return 1;
    return 0;
  });
  return commitsResult;
}

/*
  Pull Requests
*/

function getPullRequest(_ref4) {
  var owner = _ref4.owner,
      repo = _ref4.repo,
      number = _ref4.number;
  return regeneratorRuntime.async(function getPullRequest$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          authenticate();
          _context4.prev = 1;
          _context4.next = 4;
          return regeneratorRuntime.awrap(github.rest.pulls.get({
            owner: owner,
            repo: repo,
            pull_number: number
          }));

        case 4:
          return _context4.abrupt('return', _context4.sent);

        case 7:
          _context4.prev = 7;
          _context4.t0 = _context4['catch'](1);

          Logger.warn('Cannot find PR', owner + '/' + repo + '#' + number, _context4.t0.status, _context4.t0.message);
          return _context4.abrupt('return', null);

        case 11:
        case 'end':
          return _context4.stop();
      }
    }
  }, null, this, [[1, 7]]);
}

function getPullRequestsBetweenDates(_ref5) {
  var owner = _ref5.owner,
      repo = _ref5.repo,
      fromDate = _ref5.fromDate,
      toDate = _ref5.toDate;
  var options, mergedPRs;
  return regeneratorRuntime.async(function getPullRequestsBetweenDates$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          authenticate();
          options = {
            owner: owner,
            repo: repo,
            state: 'closed',
            sort: 'updated',
            direction: 'desc'
          };
          _context5.next = 4;
          return regeneratorRuntime.awrap(paginator(options, function (options) {
            return github.rest.pulls.list(options);
          }, function (prs) {
            prs = filter(prs.data, function (pr) {
              return !!pr.merged_at;
            });
            if (prs.length == 0) return prs;

            prs = filter(prs, function (pr) {
              return fromDate.isBefore(moment(pr.merged_at));
            });

            // stop pagination when there are no PRs earlier than this
            if (prs.length == 0) return null;

            return prs;
          }));

        case 4:
          mergedPRs = _context5.sent;


          mergedPRs = filter(mergedPRs, function (pr) {
            return toDate.isAfter(moment(pr.merged_at));
          });

          return _context5.abrupt('return', formatPullRequests(mergedPRs));

        case 7:
        case 'end':
          return _context5.stop();
      }
    }
  }, null, this);
}

function filterPullRequestCommits(commits) {
  var prRegex = /Merge pull request #(\d+)/;
  var filteredCommits = [];

  var _iteratorNormalCompletion2 = true;
  var _didIteratorError2 = false;
  var _iteratorError2 = undefined;

  try {
    for (var _iterator2 = commits[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
      var commit = _step2.value;

      var match = commit.summary.match(prRegex);
      if (!match) continue;

      // TODO: not ideal jamming these properties on the object
      commit.prNumber = match[1];
      filteredCommits.push(commit);
    }
  } catch (err) {
    _didIteratorError2 = true;
    _iteratorError2 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion2 && _iterator2.return) {
        _iterator2.return();
      }
    } finally {
      if (_didIteratorError2) {
        throw _iteratorError2;
      }
    }
  }

  return filteredCommits;
}

function formatPullRequests(pullRequests) {
  var pullRequestsResult = [];
  var _iteratorNormalCompletion3 = true;
  var _didIteratorError3 = false;
  var _iteratorError3 = undefined;

  try {
    for (var _iterator3 = pullRequests[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
      var pullRequest = _step3.value;

      if (pullRequest.htmlURL) pullRequestsResult.push(pullRequest);else pullRequestsResult.push({
        number: pullRequest.number,
        title: pullRequest.title,
        htmlURL: pullRequest.html_url,
        mergedAt: moment(pullRequest.merged_at),
        author: pullRequest.user.login,
        repoName: pullRequest.base.repo.full_name
      });
    }
  } catch (err) {
    _didIteratorError3 = true;
    _iteratorError3 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion3 && _iterator3.return) {
        _iterator3.return();
      }
    } finally {
      if (_didIteratorError3) {
        throw _iteratorError3;
      }
    }
  }

  pullRequestsResult.sort(function (a, b) {
    if (a.mergedAt.isBefore(b.mergedAt)) return -1;else if (b.mergedAt.isBefore(a.mergedAt)) return 1;
    return 0;
  });
  return pullRequestsResult;
}

function pullRequestsToString(pullRequests) {
  var pullRequestStrings = [];
  var _iteratorNormalCompletion4 = true;
  var _didIteratorError4 = false;
  var _iteratorError4 = undefined;

  try {
    for (var _iterator4 = pullRequests[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
      var pullRequest = _step4.value;

      pullRequestStrings.push('* [' + pullRequest.repoName + '#' + pullRequest.number + ' - ' + pullRequest.title + '](' + pullRequest.htmlURL + ')');
    }
  } catch (err) {
    _didIteratorError4 = true;
    _iteratorError4 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion4 && _iterator4.return) {
        _iterator4.return();
      }
    } finally {
      if (_didIteratorError4) {
        throw _iteratorError4;
      }
    }
  }

  return pullRequestStrings.join('\n');
}

function defaultChangelogFormatter(_ref6) {
  var pullRequests = _ref6.pullRequests,
      owner = _ref6.owner,
      repo = _ref6.repo,
      fromTag = _ref6.fromTag,
      toTag = _ref6.toTag;

  var changelog = pullRequestsToString(pullRequests);
  var title = repo;
  if (repo == 'atom') title = 'Atom Core';
  return '### [' + title + '](https://github.com/' + owner + '/' + repo + ')\n\n' + fromTag + '...' + toTag + '\n\n' + changelog;
}

function getFormattedPullRequests(_ref7) {
  var owner = _ref7.owner,
      repo = _ref7.repo,
      fromTag = _ref7.fromTag,
      toTag = _ref7.toTag,
      localClone = _ref7.localClone,
      changelogFormatter = _ref7.changelogFormatter;

  var releaseTags, commits, firstCommit, lastCommit, fromDate, toDate, pullRequests, prCommits, filteredPullRequests, pullRequestsByNumber, _iteratorNormalCompletion5, _didIteratorError5, _iteratorError5, _iterator5, _step5, pr, _iteratorNormalCompletion6, _didIteratorError6, _iteratorError6, _iterator6, _step6, commit, pullRequest;

  return regeneratorRuntime.async(function getFormattedPullRequests$(_context6) {
    while (1) {
      switch (_context6.prev = _context6.next) {
        case 0:
          Logger.log('Comparing', owner + '/' + repo, fromTag + '...' + toTag);
          if (localClone) Logger.log('Local clone of repo', localClone);

          if (changelogFormatter) {
            _context6.next = 5;
            break;
          }

          Logger.warn('A `changelogFormatter` must be specified!');
          return _context6.abrupt('return', '');

        case 5:
          if (!(repo !== 'atom' && fromTag.startsWith('vfile:.'))) {
            _context6.next = 8;
            break;
          }

          // This case will occur when an Atom package has been consolidated into atom/atom
          // for more than one release.  pr-changelog doesn't apply here because all PRs
          // for this package will show up against Atom Core
          Logger.warn('Package \'' + repo + '\' uses local package path, skipping...');
          return _context6.abrupt('return', '');

        case 8:
          if (!(repo !== 'atom' && toTag.startsWith('vfile:.'))) {
            _context6.next = 20;
            break;
          }

          // This case will occur when an Atom package has been consolidated into atom/atom
          // between the prior and current releases.  Since we can't easily compute changes
          // to the standalone package compared to what's currently in the atom/atom repo,
          // let's choose the last published version for the package to get as much info
          // as we can.
          Logger.log('Package \'' + repo + '\' uses local package path, comparing against last published tag...');
          _context6.next = 12;
          return regeneratorRuntime.awrap(github.rest.repos.listTags({ owner: owner, repo: repo }));

        case 12:
          releaseTags = _context6.sent;

          if (!(releaseTags && releaseTags.length > 0 && releaseTags[0].name !== fromTag)) {
            _context6.next = 18;
            break;
          }

          toTag = releaseTags[0].name;
          Logger.log('Package \'' + repo + '\'s last release was ' + toTag + ', comparing against that');
          _context6.next = 20;
          break;

        case 18:
          Logger.log('Package \'' + repo + '\' has not changed since the last Atom release, skipping it...');
          return _context6.abrupt('return', '');

        case 20:
          _context6.next = 22;
          return regeneratorRuntime.awrap(getCommitDiff({
            owner: owner,
            repo: repo,
            base: fromTag,
            head: toTag,
            localClone: localClone
          }));

        case 22:
          commits = _context6.sent;

          if (!(commits.length == 0)) {
            _context6.next = 25;
            break;
          }

          return _context6.abrupt('return', '');

        case 25:
          firstCommit = commits[0];
          lastCommit = commits[commits.length - 1];
          fromDate = firstCommit.date;
          toDate = lastCommit.date;


          Logger.log('Fetching PRs between dates ' + fromDate.toISOString() + ' ' + toDate.toISOString() + ' for ' + owner + '/' + repo);
          _context6.next = 32;
          return regeneratorRuntime.awrap(getPullRequestsBetweenDates({
            owner: owner,
            repo: repo,
            fromDate: fromDate,
            toDate: toDate
          }));

        case 32:
          pullRequests = _context6.sent;

          Logger.log('Found ' + pullRequests.length + ' merged PRs for ' + owner + '/' + repo);

          prCommits = filterPullRequestCommits(commits);
          filteredPullRequests = [];
          pullRequestsByNumber = {};
          _iteratorNormalCompletion5 = true;
          _didIteratorError5 = false;
          _iteratorError5 = undefined;
          _context6.prev = 40;


          for (_iterator5 = pullRequests[Symbol.iterator](); !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
            pr = _step5.value;

            pullRequestsByNumber[pr.number] = pr;
          }_context6.next = 48;
          break;

        case 44:
          _context6.prev = 44;
          _context6.t0 = _context6['catch'](40);
          _didIteratorError5 = true;
          _iteratorError5 = _context6.t0;

        case 48:
          _context6.prev = 48;
          _context6.prev = 49;

          if (!_iteratorNormalCompletion5 && _iterator5.return) {
            _iterator5.return();
          }

        case 51:
          _context6.prev = 51;

          if (!_didIteratorError5) {
            _context6.next = 54;
            break;
          }

          throw _iteratorError5;

        case 54:
          return _context6.finish(51);

        case 55:
          return _context6.finish(48);

        case 56:
          _iteratorNormalCompletion6 = true;
          _didIteratorError6 = false;
          _iteratorError6 = undefined;
          _context6.prev = 59;
          _iterator6 = prCommits[Symbol.iterator]();

        case 61:
          if (_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done) {
            _context6.next = 79;
            break;
          }

          commit = _step6.value;

          if (!pullRequestsByNumber[commit.prNumber]) {
            _context6.next = 67;
            break;
          }

          filteredPullRequests.push(pullRequestsByNumber[commit.prNumber]);
          _context6.next = 76;
          break;

        case 67:
          if (!(fromDate.toISOString() == toDate.toISOString())) {
            _context6.next = 75;
            break;
          }

          Logger.log(owner + '/' + repo + '#' + commit.prNumber + ' not in date range, fetching explicitly');
          _context6.next = 71;
          return regeneratorRuntime.awrap(getPullRequest({ owner: owner, repo: repo, number: commit.prNumber }));

        case 71:
          pullRequest = _context6.sent;

          if (pullRequest) filteredPullRequests.push(pullRequest);else Logger.warn(owner + '/' + repo + '#' + commit.prNumber + ' not found! Commit text: ' + commit.summary);
          _context6.next = 76;
          break;

        case 75:
          Logger.log(owner + '/' + repo + '#' + commit.prNumber + ' not in date range, likely a merge commit from a fork-to-fork PR');

        case 76:
          _iteratorNormalCompletion6 = true;
          _context6.next = 61;
          break;

        case 79:
          _context6.next = 85;
          break;

        case 81:
          _context6.prev = 81;
          _context6.t1 = _context6['catch'](59);
          _didIteratorError6 = true;
          _iteratorError6 = _context6.t1;

        case 85:
          _context6.prev = 85;
          _context6.prev = 86;

          if (!_iteratorNormalCompletion6 && _iterator6.return) {
            _iterator6.return();
          }

        case 88:
          _context6.prev = 88;

          if (!_didIteratorError6) {
            _context6.next = 91;
            break;
          }

          throw _iteratorError6;

        case 91:
          return _context6.finish(88);

        case 92:
          return _context6.finish(85);

        case 93:

          pullRequests = formatPullRequests(filteredPullRequests);

          if (!pullRequests.length) {
            _context6.next = 98;
            break;
          }

          return _context6.abrupt('return', changelogFormatter({
            owner: owner,
            repo: repo,
            fromTag: fromTag,
            toTag: toTag,
            pullRequests: pullRequests
          }));

        case 98:
          return _context6.abrupt('return', '');

        case 99:
        case 'end':
          return _context6.stop();
      }
    }
  }, null, this, [[40, 44, 48, 56], [49,, 51, 55], [59, 81, 85, 93], [86,, 88, 92]]);
}

/*
  Generating changelog from child packages
*/

function getFormattedPullRequestsForDependencies(_ref8) {
  var owner = _ref8.owner,
      repo = _ref8.repo,
      fromTag = _ref8.fromTag,
      toTag = _ref8.toTag,
      dependencyKey = _ref8.dependencyKey,
      changelogFormatter = _ref8.changelogFormatter;

  var options, fromRefContent, toRefContent, changedDependencies, resultList, contentOptions, getContent, getDependencies, getChangedDependencies, results, packageName, _changedDependencies$, fromRef, toRef;

  return regeneratorRuntime.async(function getFormattedPullRequestsForDependencies$(_context7) {
    while (1) {
      switch (_context7.prev = _context7.next) {
        case 0:
          getChangedDependencies = function getChangedDependencies(fromPackageJSONStr, toPackageJSONStr) {
            var changedDependencies = {};
            var fromDeps = getDependencies(fromPackageJSONStr);
            var toDeps = getDependencies(toPackageJSONStr);

            for (var packageName in fromDeps) {
              if (fromDeps[packageName] != toDeps[packageName]) {
                changedDependencies[packageName] = {
                  // Tags are prefixed with the `v`, not an ideal solution
                  fromRef: fromDeps[packageName] ? 'v' + fromDeps[packageName] : null,
                  toRef: toDeps[packageName] ? 'v' + toDeps[packageName] : null
                };
              }
            }

            return changedDependencies;
          };

          getDependencies = function getDependencies(packageJSON) {
            var json = JSON.parse(packageJSON);
            return json[dependencyKey];
          };

          getContent = function getContent(results) {
            return new Buffer(results.data.content, results.data.encoding).toString('utf-8');
          };

          options = void 0, fromRefContent = void 0, toRefContent = void 0, changedDependencies = void 0;
          resultList = [];
          contentOptions = {
            owner: owner,
            repo: repo,
            path: 'package.json'
          };


          Logger.log('\nGenerating dependency changelog for \'' + dependencyKey + '\' on ' + owner + '/' + repo);

          // get old package.json
          authenticate();
          options = clone(contentOptions);
          options.ref = fromTag;
          fromRefContent = github.rest.repos.getContent(options);

          // get new package.json
          authenticate();
          options = clone(contentOptions);
          options.ref = toTag;
          toRefContent = github.rest.repos.getContent(options);

          _context7.prev = 15;
          _context7.t0 = getContent;
          _context7.next = 19;
          return regeneratorRuntime.awrap(fromRefContent);

        case 19:
          _context7.t1 = _context7.sent;
          fromRefContent = (0, _context7.t0)(_context7.t1);
          _context7.t2 = getContent;
          _context7.next = 24;
          return regeneratorRuntime.awrap(toRefContent);

        case 24:
          _context7.t3 = _context7.sent;
          toRefContent = (0, _context7.t2)(_context7.t3);
          _context7.next = 32;
          break;

        case 28:
          _context7.prev = 28;
          _context7.t4 = _context7['catch'](15);

          Logger.log("Cannot get package.json content:", _context7.t4.message || _context7.t4);
          return _context7.abrupt('return', '');

        case 32:
          results = [];

          changedDependencies = getChangedDependencies(fromRefContent, toRefContent);
          _context7.t5 = regeneratorRuntime.keys(changedDependencies);

        case 35:
          if ((_context7.t6 = _context7.t5()).done) {
            _context7.next = 46;
            break;
          }

          packageName = _context7.t6.value;
          _changedDependencies$ = changedDependencies[packageName], fromRef = _changedDependencies$.fromRef, toRef = _changedDependencies$.toRef;

          if (!(fromRef && toRef)) {
            _context7.next = 44;
            break;
          }

          _context7.t7 = results;
          _context7.next = 42;
          return regeneratorRuntime.awrap(getFormattedPullRequests({
            owner: owner,
            repo: packageName,
            fromTag: fromRef,
            toTag: toRef,
            changelogFormatter: changelogFormatter
          }));

        case 42:
          _context7.t8 = _context7.sent;

          _context7.t7.push.call(_context7.t7, _context7.t8);

        case 44:
          _context7.next = 35;
          break;

        case 46:
          return _context7.abrupt('return', results.join('\n\n'));

        case 47:
        case 'end':
          return _context7.stop();
      }
    }
  }, null, this, [[15, 28]]);
}

function getChangelog(options) {
  var promises, results;
  return regeneratorRuntime.async(function getChangelog$(_context8) {
    while (1) {
      switch (_context8.prev = _context8.next) {
        case 0:
          promises = [getFormattedPullRequests(options)];

          if (options.dependencyKey) promises.push(getFormattedPullRequestsForDependencies(options));

          _context8.next = 4;
          return regeneratorRuntime.awrap(Promise.all(promises));

        case 4:
          results = _context8.sent;
          return _context8.abrupt('return', results.join('\n\n'));

        case 6:
        case 'end':
          return _context8.stop();
      }
    }
  }, null, this);
}

module.exports = {
  getChangelog: getChangelog,
  pullRequestsToString: pullRequestsToString,
  defaultChangelogFormatter: defaultChangelogFormatter,
  setGithubAccessToken: setGithubAccessToken
};