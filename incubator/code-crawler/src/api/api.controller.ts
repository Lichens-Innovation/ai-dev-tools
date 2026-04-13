import { Body, Controller, Get, Logger, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { getRepositoriesInfos } from "../semantic-service/git-projects.utils";
import {
  clearWorkspaceSemanticSearchIndex,
  getIndexedFileContentByFileId,
  prepareRepositoryForSemanticSearch,
  prepareWorkspaceRepositoriesForSemanticSearch,
  semanticSearchWorkspaceFiles,
  semanticSearchWorkspaceFilesWithRag,
} from "../semantic-service/repo-embeddings.utils";
import { callToolResultToRestBody } from "./api-call-tool-result.utils";
import {
  ClearWorkspaceSemanticSearchIndexDto,
  GetIndexedFileContentQueryDto,
  PrepareRepositoryForSemanticSearchDto,
  PrepareWorkspaceRepositoriesForSemanticSearchDto,
  SemanticSearchWorkspaceFilesDto,
} from "./api-request.dto";

@Controller("api")
export class ApiController {
  private readonly logger = new Logger(ApiController.name);

  @Get("indexed-file-content")
  async getIndexedFileContent(
    @Query() query: GetIndexedFileContentQueryDto,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    try {
      const outcome = await getIndexedFileContentByFileId(query.fileId);
      if (!outcome.ok) {
        res.status(outcome.httpStatus).json({ error: outcome.error });
        return;
      }
      res.status(StatusCodes.OK).json(outcome.payload);
    } catch (error) {
      this.logger.error("GET /api/indexed-file-content failed", error);
      if (!res.headersSent) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
      }
    }
  }

  @Get("workspace-repositories")
  async getWorkspaceRepositories(@Res({ passthrough: false }) res: Response): Promise<void> {
    try {
      const outcome = await getRepositoriesInfos();
      if ("error" in outcome) {
        res.status(StatusCodes.BAD_REQUEST).json({ error: outcome.error });
        return;
      }
      res.status(StatusCodes.OK).json(outcome.payload);
    } catch (error) {
      this.logger.error("GET /api/workspace-repositories failed", error);
      if (!res.headersSent) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
      }
    }
  }

  @Post("prepare-repository-for-semantic-search")
  async postPrepareRepository(
    @Body() body: PrepareRepositoryForSemanticSearchDto,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    try {
      const result = await prepareRepositoryForSemanticSearch(body);
      const { httpStatus, body: payload } = callToolResultToRestBody({ result });
      res.status(httpStatus).json(payload);
    } catch (error) {
      this.logger.error("POST /api/prepare-repository-for-semantic-search failed", error);
      if (!res.headersSent) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
      }
    }
  }

  @Post("prepare-workspace-repositories-for-semantic-search")
  async postPrepareWorkspace(
    @Body() body: PrepareWorkspaceRepositoriesForSemanticSearchDto,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    try {
      const result = await prepareWorkspaceRepositoriesForSemanticSearch(body);
      const { httpStatus, body: payload } = callToolResultToRestBody({ result });
      res.status(httpStatus).json(payload);
    } catch (error) {
      this.logger.error("POST /api/prepare-workspace-repositories-for-semantic-search failed", error);
      if (!res.headersSent) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
      }
    }
  }

  @Post("semantic-search-workspace-files")
  async postSemanticSearch(
    @Body() body: SemanticSearchWorkspaceFilesDto,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    try {
      const result = await semanticSearchWorkspaceFiles(body);
      const { httpStatus, body: payload } = callToolResultToRestBody({ result });
      res.status(httpStatus).json(payload);
    } catch (error) {
      this.logger.error("POST /api/semantic-search-workspace-files failed", error);
      if (!res.headersSent) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
      }
    }
  }

  @Post("semantic-search-workspace-files-rag")
  async postSemanticSearchWithRag(
    @Body() body: SemanticSearchWorkspaceFilesDto,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    try {
      const result = await semanticSearchWorkspaceFilesWithRag(body);
      const { httpStatus, body: payload } = callToolResultToRestBody({ result });
      res.status(httpStatus).json(payload);
    } catch (error) {
      this.logger.error("POST /api/semantic-search-workspace-files-rag failed", error);
      if (!res.headersSent) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
      }
    }
  }

  @Post("clear-workspace-semantic-index")
  async postClearIndex(
    @Body() _body: ClearWorkspaceSemanticSearchIndexDto,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    try {
      const result = await clearWorkspaceSemanticSearchIndex();
      const { httpStatus, body: payload } = callToolResultToRestBody({ result });
      res.status(httpStatus).json(payload);
    } catch (error) {
      this.logger.error("POST /api/clear-workspace-semantic-index failed", error);
      if (!res.headersSent) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
      }
    }
  }
}
