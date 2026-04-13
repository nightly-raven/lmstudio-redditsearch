import { PluginContext } from "@lmstudio/sdk";
import { configSchematics } from "./config";
import { toolsProvider } from "./toolsProvider";

export {
    RedditSearchTool,
    type RedditCommentSnippet,
    type RedditCitation,
    type RedditSearchAction,
    type RedditSearchExecutionOptions,
    type RedditSearchToolConfig,
    type RedditToolSpec,
    type RedditTimeFilter,
    type SearchContextSize,
} from "./redditSearch";

export async function main(context: PluginContext) {
    // Register the plugin configuration and tools with LM Studio.
    context.withConfigSchematics(configSchematics);
    context.withToolsProvider(toolsProvider);
}
