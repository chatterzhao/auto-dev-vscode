import Graph from "graphology";
import { SyntaxNode } from "web-tree-sitter";

import { TextRange } from "./model/TextRange";
import { LocalScope, ScopeStack } from "./scope/LocalScope";
import { LocalImport } from "./scope/LocalImport";
import { LocalDef } from "./scope/LocalDef";
import { Reference } from "./scope/Reference";
import { NodeKind } from "./scope/NodeKind";
import { LanguageConfig } from "../../code-context/_base/LanguageConfig";
import { ImportDebug, ScopeDebug } from "../../test/ScopeDebug";
import { TestOnly } from "../../ops/TestOnly";

export interface EdgeKind {
}

export class ScopeToScope implements EdgeKind {
}

export class DefToScope implements EdgeKind {
}

export class ImportToScope implements EdgeKind {
}

export class RefToDef implements EdgeKind {
}

export class RefToImport implements EdgeKind {
}

export type NodeIndex = string;

export class ScopeGraph {
	graph: Graph<NodeKind>;
	private rootIndex: NodeIndex;

	constructor(rootNode: SyntaxNode) {
		this.graph = new Graph();
		const range = TextRange.from(rootNode);
		let localScope = new LocalScope(range);
		const index = 0;
		this.graph.addNode(index, localScope);
		this.rootIndex = index.toString();
	}

	getNode(node: NodeIndex): NodeKind {
		return this.graph.getNodeAttributes(node);
	}

	getEdge(edge: string): EdgeKind {
		return this.graph.getEdgeAttributes(edge);
	}

	insertLocalScope(scope: LocalScope) {
		let parentScope = this.scopeByRange(scope.range, this.rootIndex);
		if (parentScope) {
			const indexId = this.graph.nodes().length + 1;
			this.graph.addNode(indexId, scope);
			this.graph.addEdge(indexId, parentScope, new ScopeToScope);
		}
	}

	insertLocalDef(localDef: LocalDef) {
		const definingScope = this.scopeByRange(localDef.range, this.rootIndex);
		if (definingScope) {
			const indexId = this.graph.nodes().length + 1;
			this.graph.addNode(indexId, localDef);
			this.graph.addEdge(indexId, definingScope, new DefToScope);
		}
	}

	insertHoistedDef(localDef: LocalDef) {
		const definingScope = this.scopeByRange(localDef.range, this.rootIndex);
		if (definingScope) {
			const newIndexId = this.graph.nodes().length + 1;
			this.graph.addNode(newIndexId, localDef);

			const targetScope = this.parentScope(definingScope) || definingScope;
			this.graph.addEdge(newIndexId, targetScope, new DefToScope);
		}
	}

	insertGlobalDef(localDef: LocalDef) {
		const indexId = this.graph.nodes().length + 1;
		this.graph.addNode(indexId, localDef);
		this.graph.addEdge(indexId, this.rootIndex, new DefToScope);
	}

	insertLocalImport(import_: LocalImport) {
		const definingScope = this.scopeByRange(import_.range, this.rootIndex);
		if (definingScope) {
			const indexId = this.graph.nodes().length + 1;
			this.graph.addNode(indexId, import_);
			this.graph.addEdge(indexId, definingScope, new ImportToScope);
		}
	}

	insertRef(reference: Reference, sourceCode: string) {
		let possibleDefs: string[] = [];
		let possibleImports: string[] = [];

		const localScopeIndex = this.scopeByRange(reference.range, this.rootIndex);
		if (localScopeIndex) {
			let stack = this.scopeStack(localScopeIndex);
			for (const scope of stack) {
				this.graph.inEdges(scope).filter(edge => {
					return this.graph.getEdgeAttributes(edge) instanceof DefToScope
				}).forEach(edge => {
					const localDef = this.graph.source(edge);
					const def = this.graph.getNodeAttributes(localDef) as LocalDef;
					if (reference.name(sourceCode) === def.name(sourceCode)) {
						if (def.symbolId && reference.symbolId && def.symbolId.namespaceIndex !== reference.symbolId.namespaceIndex) {
							// both contain symbols, but they don't belong to the same namepspace
						} else {
							possibleDefs.push(localDef);
						}
					}
				});

				this.graph.inEdges(scope).forEach(edge => {
					if (this.graph.getEdgeAttributes(edge) instanceof ImportToScope) {
						const localImport = this.graph.source(edge);
						const import_ = this.graph.getNodeAttributes(localImport) as LocalImport;
						if (reference.name(sourceCode) === import_.name(sourceCode)) {
							possibleImports.push(localImport);
						}
					}
				});
			}
		}

		if (possibleDefs.length > 0 || possibleImports.length > 0) {
			const newRef = new Reference(reference.range, reference.symbolId);
			const refIndex = this.graph.nodes().length + 1;
			this.graph.addNode(refIndex, newRef);
			for (const defIndex of possibleDefs) {
				this.graph.addEdge(refIndex, defIndex, new RefToDef);
			}
			for (const impIndex of possibleImports) {
				this.graph.addEdge(refIndex, impIndex, new RefToImport);
			}
		}
	}

	scopeStack(start: NodeIndex): ScopeStack {
		return new ScopeStack(this.graph, start);
	}

	private scopeByRange(range: TextRange, start: NodeIndex): NodeIndex | null {
		const targetRange = this.graph.getNodeAttributes(start).range;
		if (targetRange.contains(range)) {
			const childScopes = this.graph.inEdges(start)
				.filter(edge => this.graph.getEdgeAttributes(edge) instanceof ScopeToScope)
				.map(edge => this.graph.source(edge));
			for (const childScope of childScopes) {
				const t = this.scopeByRange(range, childScope);
				if (t) {
					return t;
				}
			}
			return start;
		}
		return null;
	}

	private parentScope(start: NodeIndex): NodeIndex | null {
		if (this.graph.getNodeAttributes(start) instanceof LocalScope) {
			const edges = this.graph.outEdges(start);
			for (const edge of edges) {
				const target = this.graph.target(edge);
				if (this.graph.getEdgeAttributes(edge) instanceof ScopeToScope) {
					return target;
				}
			}
		}

		return null;
	}

	public hoverableRanges(): TextRange[] {
		const iterator = this.graph.nodes();
		return iterator.filter(node => {
			const nodeKind = this.graph.getNodeAttributes(node);
			return nodeKind instanceof LocalDef || nodeKind instanceof Reference || nodeKind instanceof LocalImport;
		}).map(node => {
			const nodeKind = this.graph.getNodeAttributes(node);
			return nodeKind.range;
		});
	}

	public definitions(referenceNode: NodeIndex): NodeIndex[] {
		const iterator = this.graph.outEdges(referenceNode);
		return iterator.filter(edge => this.graph.getEdgeAttributes(edge) instanceof RefToDef);
	}

	public imports(referenceNode: NodeIndex): NodeIndex[] {
		const iterator = this.graph.outEdges(referenceNode);
		return iterator.filter(edge => this.graph.getEdgeAttributes(edge) instanceof RefToImport);
	}

	public references(definitionNode: NodeIndex): NodeIndex[] {
		const iterator = this.graph.inEdges(definitionNode);
		return iterator.filter(edge =>
			this.graph.getEdgeAttributes(edge) instanceof RefToDef || this.graph.getEdgeAttributes(edge) instanceof RefToImport
		);
	}

	public nodeByRange(startByte: number, endByte: number): NodeIndex | undefined {
		return this.graph.nodes()
			.filter(node => {
				const nodeKind = this.graph.getNodeAttributes(node);
				return nodeKind instanceof LocalDef || nodeKind instanceof Reference || nodeKind instanceof LocalImport;
			})
			.find(node => {
				const nodeKind = this.graph.getNodeAttributes(node);
				return nodeKind.range.start.byte >= startByte && nodeKind.range.end.byte <= endByte;
			});
	}

	debug(src: NodeIndex, language: LanguageConfig) {
		const graph = this.graph;
		const start = this.rootIndex;
		return ScopeDebug.new(graph, start, src, language);
	}

	nodeByPosition(line: number, column: number): NodeIndex | undefined {
		return this.graph.nodes()
			.filter(node => {
				const nodeKind = this.graph.getNodeAttributes(node);
				return nodeKind instanceof LocalDef || nodeKind instanceof Reference || nodeKind instanceof LocalImport;
			})
			.find(node => {
				const nodeKind = this.graph.getNodeAttributes(node);
				const range = nodeKind.range;
				return range.start.line === line && range.end.line === line && range.start.column <= column && range.end.column >= column;
			});
	}

	@TestOnly
	allLocalDefs(): NodeKind[] {
		return this.graph.nodes()
			.filter(node => this.graph.getNodeAttributes(node) instanceof LocalDef)
			.map(node => this.graph.getNodeAttributes(node));
	}

	allImportsBySource(src: string): string[] {
		let graph = this.graph;
		const imports = graph
			.inEdges(this.rootIndex)
			.filter(edge => graph.getEdgeAttributes(edge) instanceof ImportToScope)
			.map(edge => {
				const impNode = graph.source(edge);
				const range = graph.getNodeAttributes(impNode).range;

				return contextFromRange(range, src);
			});

		return imports;
	}

	allImports(src: string): ImportWithRefs[] {
		const graph = this.graph;
		return this.graph
			.inEdges(this.rootIndex)
			.filter(edge => graph.getEdgeAttributes(edge) instanceof ImportToScope)
			.map(edge => {
				const impNode = graph.source(edge);
				const range = graph.getNodeAttributes(impNode).range;
				const name = src.slice(range.start.byte, range.end.byte);

				const refs = graph
					.inEdges(impNode)
					.filter(edge => graph.getEdgeAttributes(edge) instanceof RefToImport)
					.map(edge => graph.getNodeAttributes(graph.source(edge)).range)
					.sort();

				const text = contextFromRange(range, src);

				return { name: name, range, refs, text: text};
			});
	}
}

/**
 * The `ImportWithRefs` interface in TypeScript is used to represent an import statement with its references in the code.
 * It contains information about the import name, the range of the import text, the original import text, and the usage of the import text.
 *
 * @interface
 *
 * @property {string} name - Represents the name of the import, such as `List`.
 *
 * @property {TextRange} range - Represents the range of the import text in the code. The `TextRange` object typically includes the start and end positions of the import text.
 *
 * @property {string} text - Represents the original import text, like `import java.util.List;`. This is the exact text that appears in the code.
 *
 * @property {TextRange[]} refs - An array of `TextRange` objects that represent the usage of the import text in the code, like `new List<String>();`. Each `TextRange` object in the array typically includes the start and end positions of the usage of the import text.
 *
 */
export interface ImportWithRefs {
	/// the import name, like `List`
	name: string;
	/// the range of the import text
	range: TextRange;
	/// origin import text, like `import java.util.List;`
	text: string;
	/// use import text, like `new List<String>();`
	refs: TextRange[];
}

function contextFromRange(range: TextRange, src: string): string {
	const contextStart = (() => {
		for (let i = range.start.byte - 1; i >= 0; i--) {
			if (src[i] === "\n") {
				return i + 1;
			}
		}
		return 0;
	})();

	// first new line after end
	const contextEnd = (() => {
		for (let i = range.end.byte; i < src.length; i++) {
			if (src[i] === "\n") {
				return i;
			}
		}
		return src.length;
	})();

	return [
		src.slice(contextStart, range.start.byte).trimStart(),
		src.slice(range.start.byte, range.end.byte),
		src.slice(range.end.byte, contextEnd).trimEnd(),
	].join("");
}
