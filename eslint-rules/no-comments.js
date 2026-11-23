const toolDirective =
  /^(?:\s*@ts-(?:expect-error|ignore|nocheck)\b|\s*prettier-ignore\s*$|\/\s*<reference\s)/;

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow comments other than TypeScript and Prettier directives' },
    schema: [],
    messages: {
      comment:
        'Comments are banned in this project (see CLAUDE.md). Make the code say it: clearer names, smaller functions, types, or a test.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (!toolDirective.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: 'comment' });
          }
        }
      },
    };
  },
};
