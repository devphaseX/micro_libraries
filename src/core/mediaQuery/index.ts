import { getLastItem } from '../../util/index.js';
import createObservable, { Obervable } from '../observer/index.js';

function mediaIsSupportInJS() {
  return window && typeof window.matchMedia ? true : false;
}

type MediaRule<T, P> = {
  type: T;
  params: P;
  status: { self: boolean; aggregate: boolean };
  scope?: (hasMatch: boolean) => void;
  observable: Obervable<boolean>;
};

interface Query {
  min(type: 'width' | 'height', value: number): Omit<this, 'min'>;
  max(type: 'width' | 'height', value: number): Omit<this, 'max'>;
}

type RuleTrack = { mediaOption: MediaQueryList; observable: Obervable<any> };

function createRuleTrack(match: string): RuleTrack {
  const mediaOption = window.matchMedia(match);
  let prevState = mediaOption.matches;
  const observable = createObservable<boolean>(function (next) {
    mediaOption.addEventListener('change', function ({ matches }) {
      if (prevState !== matches) {
        prevState = matches;
        next(matches);
      }
    });
  });

  return { mediaOption, observable };
}

function ruleHasMatch(rules: Array<{ state: boolean }>) {
  return rules.every((rule) => rule.state);
}

function revalidateRule(
  rule: Omit<MediaRule<any, any>, 'observable'>,
  track: RuleTrack
) {
  return {
    ...rule,
    observable: track.observable,
    state: track.mediaOption.matches,
  };
}

class CSSMediaquery implements Query {
  #rules: MediaRule<any, any>[] = [];
  private static supported: boolean;

  static {
    this.supported = mediaIsSupportInJS();
  }

  constructor() {
    if (!CSSMediaquery.supported) {
      throw new Error('match media isn"t supported on the environment');
    }
  }

  #setRule<T, P>(rule: MediaRule<T, P>) {
    this.#rules.push(rule);
  }

  hasRule(type: any) {
    return this.#rules.find((rule) => rule.type === type);
  }

  guardRule(type: any, guard: () => void) {
    if (!CSSMediaquery.supported) {
      throw new TypeError('match media isn"t supported on the environment');
    }
    if (this.hasRule(type)) {
      throw new TypeError();
    }
    return guard(), this;
  }

  min(
    type: 'width' | 'height',
    value: number,
    scope?: (isMatch: boolean) => void
  ) {
    let fullType = 'min-'.concat(type);
    return this.registerRule({
      type: fullType,
      params: value + 'px',
      status: { self: false, aggregate: false },
      scope,
    });
  }

  max(type: 'width' | 'height', value: number, scope?: () => void) {
    let fullType = 'max-'.concat(type);
    return this.registerRule({
      type: fullType,
      params: value + 'px',
      status: { self: false, aggregate: false },
      scope,
    });
  }

  scope(mediaScope: (hasMatch: boolean) => void) {
    if (!this.#rules.length) throw new TypeError();
    const finalRule = getLastItem(this.#rules)!;
    finalRule.observable.observe(mediaScope);
  }

  registerRule(rule: Omit<MediaRule<any, any>, 'observable' | 'match'>) {
    const ruleTrack = createRuleTrack(`(${rule.type}: ${rule.params})`);
    let observable = ruleTrack.observable;
    const fullRule = revalidateRule(rule, ruleTrack);

    function invokeInlineMatch() {
      if (rule.scope) {
        rule.scope(rule.status.self);
      }
    }

    if (this.#rules.length) {
      const preceedRule = getLastItem(this.#rules)!;

      if (preceedRule) {
        observable = createObservable<any>(function (next) {
          ruleTrack.observable.observe(function (value) {
            rule.status.self = value;
            rule.status.aggregate = preceedRule.status.aggregate && value;
            next(value);
          });
          preceedRule.observable.observe(function (value) {
            rule.status.aggregate = value && rule.status.self;
            next(value);
          });
        });

        observable.observe(invokeInlineMatch);
      }
    } else {
      ruleTrack.observable.observe(function (value) {
        rule.status = { self: value, aggregate: value };
        invokeInlineMatch();
      });
    }

    if (rule.scope) {
      rule.scope(fullRule.state);
    }

    return this.guardRule(rule.type, () => {
      this.#setRule(fullRule);
    });
  }
}

export default CSSMediaquery;
