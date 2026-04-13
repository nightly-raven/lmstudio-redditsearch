import { createConfigSchematics, InferParsedConfig } from "@lmstudio/sdk";
import type {
    RedditSearchToolConfig,
    RedditTimeFilter,
    SearchContextSize,
} from "./redditSearch";

export const configSchematics = createConfigSchematics()
    .field(
        "contextSize",
        "select",
        {
            displayName: "Search Context Size",
            subtitle: "Controls the default number of Reddit citations returned",
            options: [
                { value: "low", displayName: "Low" },
                { value: "medium", displayName: "Medium" },
                { value: "high", displayName: "High" },
            ],
        },
        "medium",
    )
    .field(
        "defaultSubreddit",
        "string",
        {
            displayName: "Default Subreddit",
            subtitle: "Optional subreddit to search when the tool call does not provide one",
            placeholder: "technology",
            maxLength: 64,
        },
        "",
    )
    .field(
        "maxCitations",
        "numeric",
        {
            displayName: "Search Results Per Request",
            subtitle: "Between 1 and 20, 0 = use context-size defaults",
            min: 0,
            max: 20,
            int: true,
            slider: {
                step: 1,
                min: 1,
                max: 20,
            },
        },
        0,
    )
    .field(
        "includeComments",
        "boolean",
        {
            displayName: "Include Top Comments",
            subtitle: "Fetch up to three top comments for each Reddit post result",
        },
        false,
    )
    .field(
        "timeFilter",
        "select",
        {
            displayName: "Default Time Filter",
            options: [
                { value: "any", displayName: "Any Time" },
                { value: "hour", displayName: "Past Hour" },
                { value: "day", displayName: "Past Day" },
                { value: "week", displayName: "Past Week" },
                { value: "month", displayName: "Past Month" },
                { value: "year", displayName: "Past Year" },
            ],
        },
        "any",
    )
    .field(
        "nsfwFilter",
        "boolean",
        {
            displayName: "Hide NSFW Results",
            subtitle: "Filter out over_18 Reddit posts by default",
        },
        true,
    )
    .build();

export type RedditSearchPluginConfig = InferParsedConfig<typeof configSchematics>;

export function resolveRedditSearchToolConfig(
    config: RedditSearchPluginConfig,
): RedditSearchToolConfig {
    const defaultSubreddit = normalizeString(config.get("defaultSubreddit"));

    return {
        context_size: config.get("contextSize") as SearchContextSize,
        default_subreddit: defaultSubreddit,
        include_comments: config.get("includeComments"),
        max_citations: config.get("maxCitations") > 0 ? config.get("maxCitations") : undefined,
        time_filter: config.get("timeFilter") as RedditTimeFilter,
        nsfw_filter: config.get("nsfwFilter"),
    };
}

export function resolveSearchRequestDefaults(config: RedditSearchPluginConfig): {
    maxCitations?: number;
    includeComments?: boolean;
    timeFilter?: RedditTimeFilter;
    nsfwFilter?: boolean;
} {
    return {
        maxCitations: config.get("maxCitations") > 0 ? config.get("maxCitations") : undefined,
        includeComments: config.get("includeComments"),
        timeFilter: config.get("timeFilter") as RedditTimeFilter,
        nsfwFilter: config.get("nsfwFilter"),
    };
}

function normalizeString(value: string): string | undefined {
    const trimmed = value.trim().replace(/^r\//, "");
    return trimmed.length > 0 ? trimmed : undefined;
}
