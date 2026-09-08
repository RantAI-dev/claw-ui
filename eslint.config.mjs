// Flat config. Until this file existed the repo had **no linter at all**: the
// `lint` script called `next lint`, which Next 16 removed, and eight
// `eslint-disable-next-line` directives sat in the source suppressing rules that
// nothing was running. `tsc` was the only check between a hook mistake and
// production, and it cannot see hook mistakes.
//
// `eslint-config-next` 16 exports native flat-config arrays, so these are spread
// directly. Do not reach for `FlatCompat` — it throws
// "Converting circular structure to JSON" on this version.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    // A directive suppressing a rule that does not fire is noise that outlives
    // the reason it was added — one such (`no-bitwise`, not a rule in this
    // config) was found the moment the linter first ran. Fail on the next one.
    linterOptions: { reportUnusedDisableDirectives: "error" },
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "next-env.d.ts",
      "coverage/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // ── Recorded debt, not a settled policy ──────────────────────────────────
    //
    // Turning the linter on for the first time surfaced 39 errors in 18 files.
    // All of them come from rules that are NEW in eslint-plugin-react-hooks v6
    // (the React 19 rewrite) rather than from the classic rule set:
    //
    //     24  react-hooks/set-state-in-effect
    //      9  react-hooks/refs
    //      3  react-hooks/immutability
    //      3  react-hooks/use-memo
    //
    // Fixing the `set-state-in-effect` group means rewriting how nearly every
    // ops panel loads its data. That is a behaviour change, not a lint tidy, and
    // landing it in the same pull request as the linter would produce a diff
    // nobody could review. So these four are `warn` — visible on every run,
    // counted here, and blocking nothing yet.
    //
    // This is the same shape as the `KNOWN_MISSING` backlog that was just
    // removed from the RantaiClaw docs gate, and it earns the same suspicion:
    // an exemption nobody has to act on is permanent. The count above is the
    // measure — it goes down or this comment is a lie.
    //
    // Notably NOT downgraded: `react-hooks/exhaustive-deps`, the rule seven of
    // the eight pre-existing `eslint-disable` directives suppress and the reason
    // a linter was wanted here at all. It reports one warning today and stays at
    // the preset's severity.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/use-memo": "warn",

      // `no-unused-vars`, told the two conventions this codebase already
      // follows. Neither option hides a finding; both describe a binding whose
      // whole purpose is to be unused, and without them the only way to satisfy
      // the rule is to stop writing the intent down.
      //
      //   `^_`  — a parameter that exists to hold a position in a signature.
      //           `resolveApprovalMock(_id, _approve, _always)` cannot drop its
      //           first two arguments and keep the third, and `_a` in the toast
      //           mocks is the same shape. The underscore IS the annotation.
      //
      //   rest siblings — `ol({ start, node, ...props })` in the markdown
      //           renderer destructures `node` precisely so it does NOT reach
      //           `...props` and end up on a DOM element. Removing it would
      //           reintroduce the bug it prevents.
      //
      // Everything the rule found that was genuinely dead — four imports and a
      // local — was deleted rather than configured away, which is what keeps
      // this pair honest.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
];

export default config;
