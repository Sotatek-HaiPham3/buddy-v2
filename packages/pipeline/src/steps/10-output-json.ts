import fs from 'node:fs/promises';
import path from 'node:path';
import { nodeId, type GeminiClient, type DocOutput, type TreeNode } from '@buddy/shared';
import { docDescriptionPrompt } from '../prompts/doc-description.js';
import { attachMultimodal, fromDescribedImages, fromSavedTables } from '../multimodal/attach.js';
import type { DescribedImage } from '../image/types.js';
import type { SavedTable } from '../table/types.js';

interface Opts {
  docId: string;
  docName: string;
  outPath: string;
  gemini: GeminiClient;
  generateDescription: boolean;
  images?: DescribedImage[];
  tables?: SavedTable[];
}

function assignIds(nodes: TreeNode[]): TreeNode[] {
  return nodes.map(n => ({ ...n, node_id: nodeId(), nodes: assignIds(n.nodes) }));
}

function strip(node: TreeNode): TreeNode {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('_')) continue;
    clean[k] = k === 'nodes' ? (v as TreeNode[]).map(strip) : v;
  }
  return clean as unknown as TreeNode;
}

export async function outputJson(tree: TreeNode[], opts: Opts): Promise<DocOutput> {
  let description = '';
  if (opts.generateDescription && tree.length > 0) {
    const r = await opts.gemini.generate([docDescriptionPrompt(tree)], { maxOutputTokens: 256 });
    description = r.text.trim();
  }
  const withIds = assignIds(tree).map(strip);
  const attached = attachMultimodal(withIds, {
    images: fromDescribedImages(opts.images ?? []),
    tables: fromSavedTables(opts.tables ?? []),
  });
  const out: DocOutput = {
    doc_id: opts.docId,
    doc_name: opts.docName,
    doc_description: description,
    structure: attached,
  };
  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
  await fs.writeFile(opts.outPath, JSON.stringify(out, null, 2), 'utf8');
  return out;
}
