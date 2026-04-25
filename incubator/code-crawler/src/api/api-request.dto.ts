import { createZodDto } from "nestjs-zod";
import {
  clearWorkspaceSemanticSearchIndexInputSchema,
  getIndexedFileContentByFileIdQuerySchema,
  prepareRepositoryForSemanticSearchInputSchema,
  prepareWorkspaceRepositoriesForSemanticSearchInputSchema,
  semanticSearchWorkspaceFilesInputSchema,
} from "../semantic-service/semantic-workspace.tools";

export class PrepareRepositoryForSemanticSearchDto extends createZodDto(
  prepareRepositoryForSemanticSearchInputSchema
) {}

export class PrepareWorkspaceRepositoriesForSemanticSearchDto extends createZodDto(
  prepareWorkspaceRepositoriesForSemanticSearchInputSchema
) {}

export class SemanticSearchWorkspaceFilesDto extends createZodDto(semanticSearchWorkspaceFilesInputSchema) {}

export class ClearWorkspaceSemanticSearchIndexDto extends createZodDto(clearWorkspaceSemanticSearchIndexInputSchema) {}

export class GetIndexedFileContentQueryDto extends createZodDto(getIndexedFileContentByFileIdQuerySchema) {}
