# LM Studio Reddit Search Plugin

A TypeScript-based Reddit search plugin for [LM Studio](https://lmstudio.ai/). It exposes Reddit discussion search as a structured LM Studio tool, with configurable defaults for subreddit targeting, citation count, comment inclusion, and NSFW filtering. Install it here: https://lmstudio.ai/nightly-raven/reddit-search

<p> <a href="https://ko-fi.com/nightlyraven" target="_blank"> <img src="https://ko-fi.com/img/githubbutton_sm.svg"/> </a> </p>

## Features

- Search Reddit posts with a single query or a small query batch.
- Return structured citations instead of markdown-only output.
- Optionally include top comments for each Reddit result.
- Configure default subreddit, result count, time filter, and NSFW behavior in LM Studio.
- Use context-size defaults in the same style as `nightly-raven/lmstudio-websearch`.

## Tool Included

The plugin registers one LM Studio tool:

1. `search`: Searches Reddit and returns structured post citations, optionally with top-comment snippets.

## Configuration

You can configure the following settings in LM Studio:

- `Search Context Size`: Controls the default number of results returned.
- `Default Subreddit`: Optional subreddit used when the tool call does not specify one.
- `Search Results Per Request`: Default number of Reddit posts to return.
- `Include Top Comments`: Fetches top comments for each result by default.
- `Default Time Filter`: Sets the default Reddit time window.
- `Hide NSFW Results`: Filters out `over_18` posts by default.

## Installation & Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [LM Studio](https://lmstudio.ai/) installed

### Setup

1.  Clone this repository to your local machine.
2.  Install dependencies:
    ```bash
    npm install
    ```

### Development Commands

- **Run in Development Mode**:
  ```bash
  npm run dev
  ```
  This uses `lms dev` to load the plugin into LM Studio for testing.

- **Build the Plugin**:
  ```bash
  npm run build
  ```
  Compiles the TypeScript source code into the `dist` directory.

- **Run Tests**:
  ```bash
  npm test
  ```
  Executes the test suite using the Node.js test runner.

## Technical Details

- **SDK**: Built with `@lmstudio/sdk` v1.5.0.
- **Language**: TypeScript.
- **Search Engine**: Reddit's native JSON search endpoints (`https://www.reddit.com/search.json` and subreddit-specific `/r/<subreddit>/search.json`), plus post `.json` endpoints for reading top comments.

## License

[MIT](LICENSE)
