// Two lint rules for the screens.
//
// no-readable-literal: words a person can read are never typed into a
// component. They come from src/i18n/en.js and es.js through `t()`. This rule
// refuses, in any file under src/ other than the dictionaries:
//   - text between JSX tags that has a letter in it;
//   - a string with a letter in it, placed between JSX tags as {'...'};
//   - a string with a letter in it, given to an attribute a person reads
//     (aria-label, title, placeholder, alt and the rest of READABLE);
//   - a string with a letter in it, assigned to document.title.
// It does not try to follow a string through variables: a word kept in a
// constant and shown later is the case it cannot see, and the PR template
// asks for it by hand.
//
// jsx-uses-vars: ESLint's own no-unused-vars does not count a component used
// only as <Name />, so without this every imported component reads as unused.

const READABLE = new Set([
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-placeholder',
  'aria-valuetext',
  'title',
  'placeholder',
  'alt',
  'label',
  'value',
]);

const hasLetter = (s) => /\p{L}/u.test(s);
const isDictionary = (filename) => /[\\/]src[\\/]i18n[\\/](en|es)\.js$/.test(filename);

function literalText(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.cooked).join('');
  return null;
}

const noReadableLiteral = {
  meta: {
    type: 'problem',
    messages: {
      literal:
        'readable words typed into a component: "{{text}}". Put them in src/i18n/en.js and es.js and use t().',
    },
    schema: [],
  },
  create(context) {
    if (isDictionary(context.filename)) return {};
    const report = (node, text) =>
      context.report({ node, messageId: 'literal', data: { text: text.trim().slice(0, 40) } });

    return {
      JSXText(node) {
        if (hasLetter(node.value)) report(node, node.value);
      },
      JSXExpressionContainer(node) {
        const parent = node.parent;
        const inChildren = parent.type === 'JSXElement' || parent.type === 'JSXFragment';
        if (!inChildren) return;
        const text = literalText(node.expression);
        if (text !== null && hasLetter(text)) report(node, text);
      },
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : '';
        if (!READABLE.has(name) || !node.value) return;
        const text =
          node.value.type === 'Literal'
            ? literalText(node.value)
            : node.value.type === 'JSXExpressionContainer'
              ? literalText(node.value.expression)
              : null;
        if (text !== null && hasLetter(text)) report(node, text);
      },
      AssignmentExpression(node) {
        const left = node.left;
        const isTitle =
          left.type === 'MemberExpression' &&
          left.object.type === 'Identifier' &&
          left.object.name === 'document' &&
          left.property.type === 'Identifier' &&
          left.property.name === 'title';
        if (!isTitle) return;
        const text = literalText(node.right);
        if (text !== null && hasLetter(text)) report(node, text);
      },
    };
  },
};

const jsxUsesVars = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const mark = (name, node) => context.sourceCode.markVariableAsUsed(name, node);
    return {
      JSXOpeningElement(node) {
        let n = node.name;
        while (n.type === 'JSXMemberExpression') n = n.object;
        if (n.type === 'JSXIdentifier' && /^[A-Z]/.test(n.name)) mark(n.name, node);
      },
    };
  },
};

export default { rules: { 'no-readable-literal': noReadableLiteral, 'jsx-uses-vars': jsxUsesVars } };
