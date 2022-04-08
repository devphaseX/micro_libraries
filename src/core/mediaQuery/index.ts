import createObservable, { Obervable } from '../../core/observer/index.js';
import { getLastItem, noop, testEnvironmentSupport } from '../../util/index.js';
createObservable;

type Dictionary = Record<PropertyKey, any>;
type ObservableExt<T extends Dictionary, O> = T & { observable: Obervable<O> };
type RuleStatus = StyleRule<boolean>['status'];
type ScopeFnType = 'inline' | 'aggregate' | 'both';
type RuleScope = { inline: ScopeFn<void>; aggregate: ScopeFn<void> };

type StyleRule<O> = {
  rule: string;
  status: { inline: boolean; aggregate: boolean };
  observable: Obervable<O>;
  scope: RuleScope;
};

type ScopeFn<R> = (match: boolean) => R;
type AggregateScopeFn = ScopeFn<void>;
type InlineScopeFn = ScopeFn<AggregateScopeFn | void>;

type SplitttedScoped = { type: ScopeFnType; rule: StyleRule<boolean> };

function notifyRuleScope(
  status: RuleStatus,
  scopeRule: InlineScopeFn | SplitttedScoped | null,
  invokeDirectly?: boolean
) {
  const scopeRuleIsObject = typeof scopeRule === 'object' && scopeRule !== null;

  if (scopeRuleIsObject) {
    const { scope } = scopeRule.rule;
    return validRule(scopeRule.type, scope);
  } else {
    let splittedScopeFn: RuleScope = { inline: noop, aggregate: noop };

    if (scopeRule !== null) {
      const aggregateFn = scopeRule(status.inline);
      splittedScopeFn.inline = scopeRule;
      splittedScopeFn.aggregate = aggregateFn ?? noop;
      validRule('aggregate', splittedScopeFn);
    }

    if (!invokeDirectly) {
      return splittedScopeFn;
    }
  }

  function validRule(
    type: SplitttedScoped['type'],
    scopeOption: RuleScope
  ): void {
    switch (type) {
      case 'inline':
      case 'aggregate':
        const _scope = scopeOption[type];
        return _scope === noop ? void 0 : scopeOption[type](status[type]);

      case 'both': {
        let _types: Array<Exclude<ScopeFnType, 'both'>> = [
          'inline',
          'aggregate',
        ];

        while (_types.length) {
          const type = _types.shift()!;
          validRule(type, scopeOption);
        }
      }
    }
  }
}

function trackRule<T>(
  rule: string,
  picker: (
    media: ObservableExt<MediaQueryList, any>,
    getFinalizedRule: () => ObservableExt<StyleRule<boolean>, any>
  ) => ObservableExt<StyleRule<boolean>, any>,
  register: (rule: ObservableExt<StyleRule<boolean>, any>) => T
) {
  const media = matchMedia(rule);
  let prev = media.matches;

  const observable = createObservable(function (next) {
    media.addEventListener('change', function ({ matches }) {
      if (prev === matches) return;
      prev = matches;
      next(matches);
    });
  });

  const finalRule = picker(Object.assign(media, { observable }), function () {
    return finalRule;
  });

  return register(finalRule);
}

class CSSQuery {
  static supportMedia: boolean;
  #styleRules: Array<StyleRule<boolean>> = [];

  static {
    this.supportMedia = testEnvironmentSupport(() => {
      matchMedia('()');
    });
  }

  constructor() {
    if (!CSSQuery.supportMedia) {
      throw new Error();
    }
  }

  #addRule(rule: StyleRule<boolean>) {
    this.#styleRules.push(rule);
  }

  #lockAccess(requester: () => void) {
    if (CSSQuery.supportMedia) {
      requester();
    }
    return this;
  }

  #getLastAggregateRule() {
    return getLastItem(this.#styleRules) ?? null;
  }

  validate(scope: ScopeFn<void>) {
    if (!this.#styleRules.length) throw new Error();

    return void this.#lockAccess(() => {
      const finalRule = getLastItem(this.#styleRules)!;
      notifyRuleScope({ ...finalRule.status }, scope, true);

      finalRule.observable.observe(() => {
        notifyRuleScope({ ...finalRule.status }, scope, true);
      });
    });
  }

  createRule(rule: string, scope?: InlineScopeFn): this {
    const register = (rule: ObservableExt<StyleRule<boolean>, any>) => {
      return this.#lockAccess(() => {
        this.#addRule(rule);
      });
    };

    return trackRule(
      rule,
      ({ matches, observable }, getFinalRule) => {
        const aggregate = this.#getLastAggregateRule();

        if (aggregate) {
          let inlineObservable = observable;
          observable = createObservable<{ type: ScopeFnType }>(function (next) {
            inlineObservable.observe(function (match) {
              const selfRule = getFinalRule();
              selfRule.status.inline = match;
              selfRule.status.aggregate = match && aggregate.status.aggregate;
              next({ type: 'both' });
            });

            aggregate.observable.observe(function (match) {
              const selfRule = getFinalRule();
              selfRule.status.aggregate = match && aggregate.status.aggregate;
              next({ type: 'aggregate' });
            });
          });

          observable.observe(({ type }: { type: ScopeFnType }) => {
            const selfRule = getFinalRule();
            notifyRuleScope({ ...selfRule.status }, { type, rule: selfRule });
          });
        } else {
          observable.observe(function (match) {
            const selfRule = getFinalRule();
            selfRule.status = { inline: match, aggregate: match };
            notifyRuleScope(
              { ...selfRule.status },
              { type: 'inline', rule: selfRule }
            );
          });
        }

        const status = {
          inline: matches,
          aggregate:
            (aggregate && aggregate.status.aggregate && matches) ?? matches,
        };

        const scopeFn = notifyRuleScope(status, scope ?? null)!;

        return {
          rule,
          status,
          observable,
          scope: scopeFn,
        };
      },
      register
    );
  }
}

export default CSSQuery;
