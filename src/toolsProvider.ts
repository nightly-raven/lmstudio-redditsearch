import { rawFunctionTool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import {
    configSchematics,
    resolveRedditSearchToolConfig,
    resolveSearchRequestDefaults,
} from "./config";
import { RedditSearchTool } from "./redditSearch";

const TIME_BETWEEN_REQUESTS_MS = 2_000;
let lastRequestTimestamp = 0;

const redditSearchParameters = z.object({
    query: z.string().optional(),
    queries: z.array(z.string()).min(1).max(5).optional(),
    subreddit: z.string().optional(),
    includeComments: z.boolean().optional(),
    maxCitations: z.number().int().min(1).max(20).optional(),
    timeFilter: z.enum(["any", "hour", "day", "week", "month", "year"]).optional(),
    nsfwFilter: z.boolean().optional(),
}).strict();

export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
    const redditSearchTool = rawFunctionTool({
        name: "search",
        description: [
            "Search Reddit discussions and return structured citations from relevant posts.",
            "Use this tool for Reddit queries only.",
            "Provide either `query` or `queries`.",
        ].join(" "),
        parametersJsonSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
                query: {
                    type: "string",
                    description: "Single Reddit search query.",
                },
                queries: {
                    type: "array",
                    description: "Optional batch of Reddit search queries.",
                    minItems: 1,
                    maxItems: 5,
                    items: { type: "string" },
                },
                subreddit: {
                    type: "string",
                    description: "Optional subreddit override, with or without the `r/` prefix.",
                },
                includeComments: {
                    type: "boolean",
                    description: "Include up to three top comments per Reddit post result.",
                },
                maxCitations: {
                    type: "integer",
                    minimum: 1,
                    maximum: 20,
                    description: "Optional override for the number of Reddit posts to return.",
                },
                timeFilter: {
                    type: "string",
                    enum: ["any", "hour", "day", "week", "month", "year"],
                    description: "Optional Reddit time filter override.",
                },
                nsfwFilter: {
                    type: "boolean",
                    description: "When true, filters out NSFW Reddit posts.",
                },
            },
        },
        implementation: (rawParams, ctx) => executeSearchToolCall(rawParams, ctx, ctl),
    });

    return [redditSearchTool];
}

async function executeSearchToolCall(
    rawParams: Record<string, unknown>,
    { status, warn, signal }: ToolCallRuntime,
    ctl: ToolsProviderController,
) {
    const parsedParams = redditSearchParameters.safeParse(rawParams);
    if (!parsedParams.success) {
        return `Error: Failed to parse arguments for tool "search": ${parsedParams.error.message}`;
    }

    status("Preparing Reddit search request...");
    await waitIfNeeded();

    try {
        const pluginConfig = ctl.getPluginConfig(configSchematics);
        const defaults = resolveSearchRequestDefaults(pluginConfig);
        const redditSearch = new RedditSearchTool(resolveRedditSearchToolConfig(pluginConfig));

        const result = await redditSearch.executeSearch(
            {
                type: "search",
                query: parsedParams.data.query,
                queries: parsedParams.data.queries,
                subreddit: parsedParams.data.subreddit,
            },
            {
                signal,
                includeComments: parsedParams.data.includeComments ?? defaults.includeComments,
                maxCitations: parsedParams.data.maxCitations ?? defaults.maxCitations,
                timeFilter: parsedParams.data.timeFilter ?? defaults.timeFilter,
                nsfwFilter: parsedParams.data.nsfwFilter ?? defaults.nsfwFilter,
            },
        );

        status("Completed Reddit search request.");
        return result;
    } catch (error) {
        return handleExecutionError(error, warn);
    }
}

function handleExecutionError(
    error: unknown,
    warn: (text: string) => void,
) {
    if (error instanceof DOMException && error.name === "AbortError") {
        return "Reddit search request aborted by user.";
    }

    const message = error instanceof Error ? error.message : String(error);
    warn(message);
    return `Error: ${message}`;
}

async function waitIfNeeded() {
    const timestamp = Date.now();
    const difference = timestamp - lastRequestTimestamp;
    lastRequestTimestamp = timestamp;

    if (difference < TIME_BETWEEN_REQUESTS_MS) {
        await new Promise((resolve) => setTimeout(resolve, TIME_BETWEEN_REQUESTS_MS - difference));
    }
}

type ToolCallRuntime = {
    status: (text: string) => void;
    warn: (text: string) => void;
    signal: AbortSignal;
};
