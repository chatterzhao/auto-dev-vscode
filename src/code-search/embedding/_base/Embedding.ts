import { TextRange } from "../../scope-graph/model/TextRange";

export type Embedding = number[];

export interface ScoredItem<T> {
	score: number;
	item: T;
}

export interface ChunkItem {
	name: string;
	file: string;
	text: string;
	range: TextRange;
	embedding: Embedding;
	score?: number;
}
