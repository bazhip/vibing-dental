declare module 'bidi-js' {
  interface Embedding { levels: Uint8Array; paragraphs: { start: number; end: number; level: number }[] }
  export default function bidiFactory(): {
    getEmbeddingLevels(text: string, direction?: 'ltr' | 'rtl'): Embedding;
    getReorderedIndices(text: string, embedding: Embedding): number[];
    getMirroredCharactersMap(text: string, levels: Uint8Array): Map<number, string>;
  };
}
