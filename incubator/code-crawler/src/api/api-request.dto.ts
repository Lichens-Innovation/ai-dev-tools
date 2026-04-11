import { createZodDto } from "nestjs-zod";
import {
  clearWorkspaceSemanticSearchIndexInputSchema,
  prepareRepositoryForSemanticSearchInputSchema,
  prepareWorkspaceRepositoriesForSemanticSearchInputSchema,
  semanticSearchWorkspaceFilesInputSchema,
} from "../semantic-service/repo-embeddings.utils";

export class PrepareRepositoryForSemanticSearchDto extends createZodDto(
  prepareRepositoryForSemanticSearchInputSchema
) {}

export class PrepareWorkspaceRepositoriesForSemanticSearchDto extends createZodDto(
  prepareWorkspaceRepositoriesForSemanticSearchInputSchema
) {}

export class SemanticSearchWorkspaceFilesDto extends createZodDto(semanticSearchWorkspaceFilesInputSchema) {}

export class ClearWorkspaceSemanticSearchIndexDto extends createZodDto(clearWorkspaceSemanticSearchIndexInputSchema) {}
