import { Client } from '@elastic/elasticsearch';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  auth: process.env.ELASTICSEARCH_API_KEY 
    ? { apiKey: process.env.ELASTICSEARCH_API_KEY }
    : process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD 
      ? {
          username: process.env.ELASTICSEARCH_USERNAME,
          password: process.env.ELASTICSEARCH_PASSWORD,
        }
      : undefined,
});

const INDEX_NAME = 'players';

export async function initElasticsearch() {
  try {
    const exists = await esClient.indices.exists({ index: INDEX_NAME });

    if (!exists) {
      await esClient.indices.create({
        index: INDEX_NAME,
        settings: {
          analysis: {
            analyzer: {
              autocomplete: {
                type: 'custom',
                tokenizer: 'autocomplete',
                filter: ['lowercase'],
              },
              autocomplete_search: {
                type: 'custom',
                tokenizer: 'lowercase',
              },
            },
            tokenizer: {
              autocomplete: {
                type: 'edge_ngram',
                min_gram: 1,
                max_gram: 20,
                token_chars: ['letter', 'digit'],
              },
            },
          },
        },
        mappings: {
          properties: {
            gameName: {
              type: 'text',
              analyzer: 'autocomplete',
              search_analyzer: 'autocomplete_search',
            },
            tagLine: { type: 'keyword' },
            puuid: { type: 'keyword' },
            region: { type: 'keyword' },
            rank: { type: 'keyword' },
            lp: { type: 'integer' },
            lastSeen: { type: 'date' },
          },
        },
      });
      console.log(`[Elasticsearch] Index "${INDEX_NAME}" created with autocomplete mapping.`);
    }
  } catch (err) {
    console.error('[Elasticsearch] Init failed:', err);
  }
}

export default esClient;
