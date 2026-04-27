export interface QueryEmbedder {
  readonly dimensions: 1536
  readonly modelName: string
  embed(query: string): Promise<number[]>
}
