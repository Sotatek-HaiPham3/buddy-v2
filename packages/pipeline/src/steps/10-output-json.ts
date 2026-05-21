import fs from 'node:fs/promises';
import path from 'node:path';
import { nodeId, type GeminiClient, type DocOutput, type TreeNode } from '@buddy/shared';
import { docDescriptionPrompt } from '../prompts/doc-description.js';

interface Opts {
  docId: string;
  docName: string;
  outPath: string;
  gemini: GeminiClient;
  generateDescription: boolean;
}

function assignIds(nodes: TreeNode[]): TreeNode[] {
  return nodes.map(n => ({ ...n, node_id: nodeId(), nodes: assignIds(n.nodes) }));
}

export async function outputJson(tree: TreeNode[], opts: Opts): Promise<DocOutput> {
  let description = '';
  if (opts.generateDescription && tree.length > 0) {
    const r = await opts.gemini.generate([docDescriptionPrompt(tree)], { maxOutputTokens: 256 });
    description = r.text.trim();
  }
  const withIds = assignIds(tree);
  const out: DocOutput = {
    doc_id: opts.docId,
    doc_name: opts.docName,
    doc_description: description,
    structure: withIds,
  };
  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
  await fs.writeFile(opts.outPath, JSON.stringify(out, null, 2), 'utf8');
  return out;
}
