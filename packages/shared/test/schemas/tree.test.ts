import { describe, expect, it } from 'vitest';
import { docOutputSchema, treeNodeSchema } from '../../src/schemas/tree.js';

describe('treeNodeSchema', () => {
  it('parses a minimal leaf node', () => {
    const node = {
      title: 'Intro',
      start_index: 1,
      end_index: 3,
      node_id: 'node_abc',
    };
    expect(treeNodeSchema.parse(node)).toEqual({ ...node, nodes: [], images: [], tables: [] });
  });

  it('parses a nested node with children', () => {
    const node = {
      title: 'Chapter 1',
      start_index: 1,
      end_index: 10,
      node_id: 'node_1',
      nodes: [
        {
          title: '1.1 Background',
          start_index: 2,
          end_index: 5,
          node_id: 'node_1_1',
        },
      ],
    };
    const out = treeNodeSchema.parse(node);
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0]?.title).toBe('1.1 Background');
  });

  it('accepts optional summary, images, tables', () => {
    const node = {
      title: 'Risk',
      start_index: 8,
      end_index: 14,
      node_id: 'node_r',
      summary: 'Analyzes risks.',
      images: [{ path: 'img/8-1.png', caption: 'Chart', page: 9 }],
      tables: [{ path: 'tbl/10-1.json', page: 10, schema: 'Revenue by region' }],
    };
    const out = treeNodeSchema.parse(node);
    expect(out.summary).toBe('Analyzes risks.');
    expect(out.images[0]?.caption).toBe('Chart');
    expect(out.tables[0]?.schema).toBe('Revenue by region');
  });

  it('rejects nodes with end_index < start_index', () => {
    expect(() =>
      treeNodeSchema.parse({
        title: 'Bad',
        start_index: 10,
        end_index: 5,
        node_id: 'node_b',
      }),
    ).toThrow();
  });

  it('accepts doc_page_start and doc_page_end as optional numbers', () => {
    const node = treeNodeSchema.parse({
      title: 'Chapter 1',
      start_index: 1,
      end_index: 2,
      node_id: 'n1',
      nodes: [],
      images: [],
      tables: [],
      doc_page_start: 5,
      doc_page_end: 6,
    });
    expect(node.doc_page_start).toBe(5);
    expect(node.doc_page_end).toBe(6);
  });

  it('accepts TreeNode without doc_page fields', () => {
    const node = treeNodeSchema.parse({
      title: 'Chapter 1',
      start_index: 1,
      end_index: 2,
      node_id: 'n1',
      nodes: [],
      images: [],
      tables: [],
    });
    expect(node.doc_page_start).toBeUndefined();
    expect(node.doc_page_end).toBeUndefined();
  });
});

describe('docOutputSchema', () => {
  it('parses a full document output', () => {
    const doc = {
      doc_id: 'doc_x',
      doc_name: 'annual-report.pdf',
      doc_description: '2023 financial report',
      structure: [{ title: 'Exec Summary', start_index: 1, end_index: 14, node_id: 'node_0' }],
    };
    const out = docOutputSchema.parse(doc);
    expect(out.doc_name).toBe('annual-report.pdf');
    expect(out.structure).toHaveLength(1);
  });
});
