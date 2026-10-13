const itemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'title', 'category', 'kind', 'published', 'summary', 'why', 'relevance', 'caveat', 'tags', 'sources'],
  properties: {
    id: { type: 'string', pattern: '^n-[0-9]{8}-[a-z0-9-]+$' },
    title: { type: 'string', minLength: 1 },
    category: { type: 'string', enum: ['AI / 大模型', 'Agent', '机器人 / 具身', '无人机', '科技产业'] },
    kind: { type: 'string', minLength: 1 },
    published: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    summary: { type: 'string', minLength: 1 },
    why: { type: 'string', minLength: 1 },
    relevance: { type: 'string', minLength: 1 },
    caveat: { type: 'string', minLength: 1 },
    tags: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    sources: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'url'],
        properties: {
          name: { type: 'string', minLength: 1 },
          url: { type: 'string', pattern: '^https://.+' }
        }
      }
    }
  }
};

export function responseSchema(date, count = 5) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'date', 'timezone', 'generatedBy', 'title', 'editorialNote', 'news'],
    properties: {
      schemaVersion: { type: 'integer', enum: [1] },
      date: { type: 'string', enum: [date] },
      timezone: { type: 'string', enum: ['Asia/Shanghai'] },
      generatedBy: { type: 'string', enum: ['ChatGPT'] },
      title: { type: 'string', minLength: 1 },
      editorialNote: { type: 'string', minLength: 1 },
      news: { type: 'array', minItems: count, maxItems: count, items: itemSchema }
    }
  };
}

