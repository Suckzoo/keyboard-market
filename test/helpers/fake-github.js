function makeFakeGithub({ comments = [], issue = {} } = {}) {
  const calls = [];
  const rest = {
    issues: {
      listComments: async () => ({ data: comments }),
      createComment: async (p) => { calls.push(['createComment', p]); return { data: {} }; },
      addLabels: async (p) => { calls.push(['addLabels', p]); return { data: {} }; },
      removeLabel: async (p) => { calls.push(['removeLabel', p]); return { data: {} }; },
      get: async () => ({ data: issue }),
      update: async (p) => { calls.push(['update', p]); Object.assign(issue, p); return { data: {} }; },
    },
  };
  const github = { rest, paginate: async (fn, params) => (await fn(params)).data };
  return { github, calls, issue };
}
module.exports = { makeFakeGithub };
