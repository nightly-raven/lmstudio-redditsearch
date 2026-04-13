import axios from "axios";
import { z } from "zod";

const REDDIT_BASE_URL = "https://www.reddit.com";
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "LMStudioRedditSearch/0.0.2";

const RedditPostSchema = z.object({
    id: z.string(),
    title: z.string().nullable().optional(),
    selftext: z.string().nullable().optional(),
    author: z.string(),
    subreddit: z.string(),
    permalink: z.string().nullable().optional(),
    score: z.number(),
    created_utc: z.number(),
    num_comments: z.number().nullable().optional(),
    over_18: z.boolean().optional(),
});

const RedditCommentSchema = z.object({
    id: z.string(),
    body: z.string().nullable().optional(),
    author: z.string(),
    score: z.number().nullable().optional(),
    created_utc: z.number().optional(),
});

const RedditListingSchema = z.object({
    data: z.object({
        children: z.array(z.object({
            kind: z.string().optional(),
            data: z.unknown(),
        })),
    }),
});

const RedditCommentsResponseSchema = z.tuple([RedditListingSchema, RedditListingSchema]);

export type SearchContextSize = "low" | "medium" | "high";
export type RedditTimeFilter = "any" | "hour" | "day" | "week" | "month" | "year";

export type RedditSearchAction =
    | { type: "search"; query?: string; queries?: Array<string>; subreddit?: string }
    | { type: "other" };

export interface RedditSearchToolConfig {
    context_size?: SearchContextSize;
    default_subreddit?: string;
    include_comments?: boolean;
    max_citations?: number;
    time_filter?: RedditTimeFilter;
    nsfw_filter?: boolean;
}

export interface RedditSearchExecutionOptions {
    signal?: AbortSignal;
    includeComments?: boolean;
    maxCitations?: number;
    timeFilter?: RedditTimeFilter;
    nsfwFilter?: boolean;
}

export interface RedditToolSpec {
    type: "search";
    external_web_access: true;
    search_target: "reddit";
    default_subreddit?: string;
    search_context_size?: SearchContextSize;
    search_content_types: ["forum_posts", "comments"];
}

export interface RedditCommentSnippet {
    id: string;
    author: `u/${string}`;
    score: number;
    content: string;
    timestamp?: string;
}

export interface RedditCitation {
    id: string;
    title: string;
    author: `u/${string}`;
    subreddit: `r/${string}`;
    permalink: string;
    score: number;
    num_comments: number;
    content?: string;
    timestamp: string;
    top_comments?: RedditCommentSnippet[];
}

export class RedditSearchTool {
    public constructor(private readonly config: RedditSearchToolConfig = {}) {}

    getToolSpec(): RedditToolSpec {
        return {
            type: "search",
            external_web_access: true,
            search_target: "reddit",
            default_subreddit: this.config.default_subreddit,
            search_context_size: this.config.context_size,
            search_content_types: ["forum_posts", "comments"],
        };
    }

    async executeSearch(
        action: RedditSearchAction,
        options: RedditSearchExecutionOptions = {},
    ): Promise<unknown> {
        switch (action.type) {
            case "search":
                return this.performSearch(action, options);
            default:
                throw new Error(`Unsupported action type: ${action.type}`);
        }
    }

    private async performSearch(
        action: Extract<RedditSearchAction, { type: "search" }>,
        options: RedditSearchExecutionOptions,
    ) {
        const searchQueries = action.queries?.length
            ? action.queries
            : action.query
                ? [action.query]
                : [];

        if (searchQueries.length === 0) {
            throw new Error("At least one query is required for search actions");
        }

        const subreddit = normalizeSubreddit(action.subreddit ?? this.config.default_subreddit);
        const includeComments = options.includeComments ?? this.config.include_comments ?? false;
        const maxCitations = resolveMaxCitations(
            options.maxCitations,
            this.config.max_citations,
            this.config.context_size,
        );
        const timeFilter = options.timeFilter ?? this.config.time_filter ?? "any";
        const nsfwFilter = options.nsfwFilter ?? this.config.nsfw_filter ?? true;

        const results = await Promise.all(
            searchQueries.map(async (query) => ({
                query,
                citations: await this.searchReddit(query, {
                    subreddit,
                    includeComments,
                    maxCitations,
                    timeFilter,
                    nsfwFilter,
                    signal: options.signal,
                }),
            })),
        );

        return {
            action: "search",
            subreddit,
            query: action.query,
            queries: action.queries,
            results,
            tool_spec: this.getToolSpec(),
        };
    }

    private async searchReddit(
        query: string,
        options: Required<Omit<RedditSearchExecutionOptions, "signal">> & {
            subreddit?: string;
            signal?: AbortSignal;
        },
    ): Promise<RedditCitation[]> {
        const response = await axios.get(this.buildSearchUrl(options.subreddit), {
            headers: {
                "User-Agent": USER_AGENT,
            },
            params: {
                q: query,
                limit: Math.min(options.maxCitations * 3, 50),
                raw_json: 1,
                restrict_sr: options.subreddit ? "on" : "off",
                sort: "relevance",
                t: options.timeFilter,
            },
            signal: options.signal,
            timeout: REQUEST_TIMEOUT_MS,
        });

        const listing = RedditListingSchema.parse(response.data);
        const posts = listing.data.children
            .map(({ data }) => RedditPostSchema.safeParse(data))
            .filter((result) => result.success)
            .map((result) => result.data)
            .filter((post) => !options.nsfwFilter || !post.over_18)
            .slice(0, options.maxCitations);

        return Promise.all(posts.map((post) => this.buildCitation(post, options.includeComments, options.signal)));
    }

    private async buildCitation(
        post: z.infer<typeof RedditPostSchema>,
        includeComments: boolean,
        signal?: AbortSignal,
    ): Promise<RedditCitation> {
        const topComments = includeComments
            ? await this.fetchTopComments(post.permalink, signal)
            : undefined;

        return {
            id: post.id,
            title: post.title?.trim() || "Untitled",
            author: `u/${post.author}`,
            subreddit: `r/${post.subreddit}`,
            permalink: this.buildPermalink(post),
            score: post.score,
            num_comments: post.num_comments ?? 0,
            content: this.extractContent(post),
            timestamp: new Date(post.created_utc * 1000).toISOString(),
            top_comments: topComments,
        };
    }

    private async fetchTopComments(
        permalink: string | null | undefined,
        signal?: AbortSignal,
    ): Promise<RedditCommentSnippet[]> {
        if (!permalink) {
            return [];
        }

        const response = await axios.get(`${this.buildPermalinkFromPath(permalink)}.json`, {
            headers: {
                "User-Agent": USER_AGENT,
            },
            params: {
                raw_json: 1,
                limit: 3,
                sort: "top",
            },
            signal,
            timeout: REQUEST_TIMEOUT_MS,
        });

        const parsed = RedditCommentsResponseSchema.safeParse(response.data);
        if (!parsed.success) {
            return [];
        }

        return parsed.data[1].data.children
            .map(({ data }) => RedditCommentSchema.safeParse(data))
            .filter((result) => result.success)
            .map((result) => result.data)
            .filter((comment) => Boolean(comment.body?.trim()))
            .slice(0, 3)
            .map((comment) => ({
                id: comment.id,
                author: `u/${comment.author}`,
                score: comment.score ?? 0,
                content: truncateText(comment.body?.trim() ?? "", 280),
                timestamp: comment.created_utc
                    ? new Date(comment.created_utc * 1000).toISOString()
                    : undefined,
            }));
    }

    private buildSearchUrl(subreddit?: string): string {
        if (subreddit) {
            return `${REDDIT_BASE_URL}/r/${encodeURIComponent(subreddit)}/search.json`;
        }

        return `${REDDIT_BASE_URL}/search.json`;
    }

    private buildPermalink(post: z.infer<typeof RedditPostSchema>): string {
        return this.buildPermalinkFromPath(
            post.permalink ?? `/r/${post.subreddit}/comments/${post.id}`,
        );
    }

    private buildPermalinkFromPath(permalink: string): string {
        return permalink.startsWith("http")
            ? permalink
            : `${REDDIT_BASE_URL}${permalink}`;
    }

    private extractContent(post: z.infer<typeof RedditPostSchema>): string {
        if (!post.selftext || post.selftext.trim() === "") {
            return `[Title] ${post.title?.trim() || "Untitled"}`;
        }

        return `[Body] ${truncateText(post.selftext.trim(), 2_000)}`;
    }
}

function resolveMaxCitations(
    overrideValue?: number,
    configValue?: number,
    contextSize: SearchContextSize = "medium",
): number {
    const candidate = overrideValue ?? configValue;
    if (candidate && candidate >= 1) {
        return Math.min(candidate, 20);
    }

    switch (contextSize) {
        case "low":
            return 3;
        case "high":
            return 8;
        default:
            return 5;
    }
}

function normalizeSubreddit(subreddit?: string): string | undefined {
    const trimmed = subreddit?.trim().replace(/^r\//, "");
    return trimmed ? trimmed : undefined;
}

function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength)}...`;
}
