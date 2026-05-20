import { nanoid } from 'nanoid';

const make = (prefix: string) => (): string => `${prefix}_${nanoid(21)}`;

export const convId = make('conv');
export const msgId = make('msg');
export const docId = make('doc');
export const nodeId = make('node');
export const runId = make('run');
