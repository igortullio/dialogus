export interface EmbeddingProvider {
  readonly dimensions: 1536
  readonly modelName: string
  embed(texts: readonly string[]): Promise<number[][]>
}
