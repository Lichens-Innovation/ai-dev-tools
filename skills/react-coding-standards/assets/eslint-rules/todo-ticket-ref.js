/**
 * Local ESLint rule: require a ticket reference in TODO comments.
 * Uses ESLint 9+ API (context.sourceCode). Replaces eslint-plugin-todo-plz for this rule.
 */
const ticketRefRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require a ticket reference in the TODO comment",
      recommended: false,
    },
    schema: [
      {
        type: "object",
        properties: {
          pattern: { type: "string" },
          terms: { type: "array", items: { type: "string" } },
          commentPattern: { type: "string" },
          description: { type: "string" },
          comment: { type: "string" }, // ignored, kept for config compatibility
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingTicket: "{{ term }} comment doesn't reference a ticket number. Ticket pattern: {{ pattern }}",
      missingTicketWithCommentPattern:
        "{{ term }} comment doesn't reference a ticket number. Comment pattern: {{ commentPattern }}",
      missingTicketWithDescription:
        "{{ term }} comment doesn't reference a ticket number. {{ description }}",
    },
  },
  create(context) {
    const opts = context.options[0] ?? {};
    const pattern = opts.pattern ?? "([A-Z]+-\\d+)";
    const terms = opts.terms ?? ["TODO"];
    const commentPattern = opts.commentPattern;
    const description = opts.description;

    const sourceCode = context.sourceCode;
    const comments = sourceCode.getAllComments();

    const termSearchPatterns = {};
    for (const term of terms) {
      termSearchPatterns[term] = commentPattern
        ? new RegExp(commentPattern, "i")
        : new RegExp(`${term}\\s?\\((${pattern}[,\\s]*)+\\)`, "i");
    }

    function getMessageId() {
      if (description) return "missingTicketWithDescription";
      if (commentPattern) return "missingTicketWithCommentPattern";
      return "missingTicket";
    }

    for (const comment of comments) {
      const value = comment.value;
      for (const term of terms) {
        if (!value.includes(term)) continue;
        const re = termSearchPatterns[term];
        if (re.test(value)) continue;
        context.report({
          loc: comment.loc,
          messageId: getMessageId(),
          data: { term, pattern, commentPattern, description },
        });
      }
    }

    return {};
  },
};

/** Plugin object for flat config: use as plugins["todo-plz"] and rules["todo-plz/ticket-ref"] */
export default {
  rules: {
    "ticket-ref": ticketRefRule,
  },
};
