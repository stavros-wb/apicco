const path = require('path');
const Boom = require('boom');
const Router = require('koa-router');
const compose = require('koa-compose');
const joiValidate = require('koa-joi-validate');
const { underscore, pluralize } = require('inflection');

async function accepts(ctx, next) {
  if (!ctx.accepts('application/json')) {
    ctx.throw(406, 'json only');
  }
  await next();
}

function buildAPIRouter({
  apiPath = '.',
  prefix = '/api/v1',
  beforeMiddlewares = [],
  afterMiddlewares = [],
  verbose = false
} = {}) {
  const router = new Router();

  router
    .prefix(prefix)
    .use(accepts);

  const api = {};

  const resources = require('require-directory')(
    module,
    path.resolve(apiPath),
    {
      exclude: /(\.test\.)|(index\.js)/
    }
  );

  for (let r in resources) {
    if (!resources.hasOwnProperty(r)) {
      continue;
    }

    const actions = resources[r];

    for (let a in actions) {
      if (!actions.hasOwnProperty(a)) {
        continue;
      }

      const action = `${r}.${a}`;
      const { validate, handle } = actions[a];

      if (!handle) {
        throw new Error(`Missing action handle for ${action} action.`);
      }

      const middlewares = [
        ...beforeMiddlewares,
        joiValidate({ body: validate }),
        handle,
        ...afterMiddlewares
      ];

      const params = [];

      for (let param in validate) {
        if (!validate.hasOwnProperty(param)) {
          continue;
        }

        const { isJoi = true, _flags = {}} = validate[param];

        if (!isJoi) {
          throw new Error(`Invalid Joi validation for ${actionName} action: ${param}.`);
        }

        const paramsName = _flags.presence === 'required' ? `*${param}` : param;

        params.push(paramsName);
      }

      api[action] = params;

      router.post(`/${action}`, compose(middlewares));

      if (verbose) {
        console.log(`Loaded: ${r}.${a} action`);
      }
    }

    router.get('/discovery', ctx => {
      ctx.status = 200;
      ctx.body = JSON.stringify(api, null, 2);
    });
  }

  return compose([
    router.routes(),
    router.allowedMethods({
      throw: true,
      notImplemented: () => Boom.notImplemented(),
      methodNotAllowed: () => Boom.methodNotAllowed()
    })
  ]);
}

module.exports = buildAPIRouter;