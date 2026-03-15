<script>
  let terminalStep = $state(0);
  const maxSteps = 4;

  function advanceTerminal() {
    if (terminalStep < maxSteps) {
      terminalStep++;
    } else {
      terminalStep = 0;
    }
  }
</script>

<svelte:head>
  <title>git-regress — Catch semantic regressions before they ship</title>
</svelte:head>

<div class="min-h-screen">
  <!-- Nav -->
  <nav class="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50 bg-zinc-950/80">
    <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
      <span class="font-mono font-medium text-sm text-zinc-100">git-regress</span>
      <div class="flex items-center gap-6">
        <a href="#how-it-works" class="text-sm text-zinc-400 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded">How it works</a>
        <a href="#install" class="text-sm text-zinc-400 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded">Install</a>
        <a
          href="https://github.com/TonyStef/git-regress"
          target="_blank"
          rel="noopener"
          class="text-sm text-zinc-400 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded"
        >
          GitHub
        </a>
      </div>
    </div>
  </nav>

  <!-- Hero -->
  <section class="max-w-5xl mx-auto px-6 pt-24 pb-20">
    <div class="flex items-start gap-12">
    <div class="max-w-2xl">
      <p class="font-mono text-sm text-emerald-400 mb-4">Open source CLI + GitHub Action</p>
      <h1 class="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6" style="text-wrap: balance">
        Catch semantic regressions
        <span class="text-zinc-500">before they ship</span>
      </h1>
      <p class="text-lg text-zinc-400 leading-relaxed mb-8">
        git-regress detects when a PR silently breaks recently merged work.
        Git sees no conflict. CI passes. Code review misses it.
        This tool catches it.
      </p>
      <div class="flex gap-4">
        <a
          href="#install"
          class="px-5 py-2.5 bg-zinc-100 text-zinc-900 font-medium text-sm rounded-lg hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          Get started
        </a>
        <a
          href="https://github.com/TonyStef/git-regress"
          target="_blank"
          rel="noopener"
          class="px-5 py-2.5 border border-zinc-700 text-zinc-300 font-medium text-sm rounded-lg hover:border-zinc-500 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          View source
        </a>
      </div>
    </div>
    <div class="hidden lg:block flex-shrink-0 mt-4">
      <img src="/favicon.svg" alt="" width="160" height="160" class="rounded-2xl opacity-90 hover:opacity-100 transition-opacity" />
    </div>
    </div>
  </section>

  <!-- Problem -->
  <section class="border-t border-zinc-800/50">
    <div class="max-w-5xl mx-auto px-6 py-20">
      <h2 class="font-mono text-sm text-zinc-500 mb-8">THE PROBLEM</h2>
      <div class="grid md:grid-cols-3 gap-6">
        <div class="p-6 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4">
            <span class="text-emerald-400 font-mono text-sm font-bold">1</span>
          </div>
          <h3 class="font-medium mb-2">PR #350 merges</h3>
          <p class="text-sm text-zinc-400 leading-relaxed">
            Adds <code class="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded text-xs font-mono">identifyAgentTurns()</code>
            to helpers.ts. PR #351 imports and uses it. Both merge clean.
          </p>
        </div>
        <div class="p-6 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4">
            <span class="text-amber-400 font-mono text-sm font-bold">2</span>
          </div>
          <h3 class="font-medium mb-2">PR #375 refactors</h3>
          <p class="text-sm text-zinc-400 leading-relaxed">
            Deletes <code class="text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded text-xs font-mono">identifyAgentTurns()</code>
            as part of a cleanup. Git sees no merge conflict — different lines were touched.
          </p>
        </div>
        <div class="p-6 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
          <div class="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center mb-4">
            <span class="text-red-400 font-mono text-sm font-bold">3</span>
          </div>
          <h3 class="font-medium mb-2">Silent breakage</h3>
          <p class="text-sm text-zinc-400 leading-relaxed">
            PR #350 and #351 are now broken in production. CI passed. Code review missed it. Nobody knows until a user reports it.
          </p>
        </div>
      </div>
    </div>
  </section>

  <!-- How it works -->
  <section id="how-it-works" class="border-t border-zinc-800/50">
    <div class="max-w-5xl mx-auto px-6 py-20">
      <h2 class="font-mono text-sm text-zinc-500 mb-8">HOW IT WORKS</h2>
      <div class="grid md:grid-cols-2 gap-12 items-start">
        <div class="space-y-6">
          <div class="flex gap-4">
            <div class="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-xs font-mono text-zinc-400">1</span>
            </div>
            <div>
              <h3 class="font-medium mb-1">Track</h3>
              <p class="text-sm text-zinc-400 leading-relaxed">
                On every merged PR, parses the diff with tree-sitter and records which symbols were added and which existing symbols the new code depends on.
              </p>
            </div>
          </div>
          <div class="flex gap-4">
            <div class="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-xs font-mono text-zinc-400">2</span>
            </div>
            <div>
              <h3 class="font-medium mb-1">Scan</h3>
              <p class="text-sm text-zinc-400 leading-relaxed">
                On every new PR, parses the diff again to find symbols that were deleted or had their signatures changed.
              </p>
            </div>
          </div>
          <div class="flex gap-4">
            <div class="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-xs font-mono text-zinc-400">3</span>
            </div>
            <div>
              <h3 class="font-medium mb-1">Flag</h3>
              <p class="text-sm text-zinc-400 leading-relaxed">
                Cross-references deletions against recently merged footprints. If there's overlap, warns you in the terminal or posts a PR comment.
              </p>
            </div>
          </div>
        </div>

        <!-- Terminal mockup -->
        <button
          onclick={advanceTerminal}
          aria-label="Step through terminal demo"
          class="w-full text-left rounded-xl bg-zinc-900 border border-zinc-800/80 overflow-hidden shadow-2xl cursor-pointer hover:border-zinc-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          <div class="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/50">
            <div class="w-3 h-3 rounded-full bg-zinc-700"></div>
            <div class="w-3 h-3 rounded-full bg-zinc-700"></div>
            <div class="w-3 h-3 rounded-full bg-zinc-700"></div>
            <span class="text-xs text-zinc-500 ml-2 font-mono">terminal</span>
          </div>
          <div class="p-4 font-mono text-xs leading-relaxed space-y-1">
            {#if terminalStep >= 0}
              <p class="text-zinc-500">$ git-regress check --base main</p>
            {/if}
            {#if terminalStep >= 1}
              <p class="mt-3 text-amber-400 font-medium">Warning: Potential semantic regression detected</p>
            {/if}
            {#if terminalStep >= 2}
              <p class="mt-3 text-zinc-300">This PR deletes <span class="text-red-400">`identifyAgentTurns`</span> (function in helpers.ts)</p>
              <p class="text-zinc-500">  -> Introduced by PR #350 (merged 3 days ago by @tony)</p>
              <p class="text-zinc-500">  -> Referenced by PR #351 (merged 2 days ago by @tony)</p>
            {/if}
            {#if terminalStep >= 3}
              <p class="mt-3 text-zinc-300">This PR deletes <span class="text-red-400">`visibleSegments`</span> (interface in MessageEntry.tsx)</p>
              <p class="text-zinc-500">  -> Introduced by PR #350 (merged 3 days ago by @tony)</p>
            {/if}
            {#if terminalStep >= 4}
              <p class="mt-3 text-zinc-400 italic">This may silently break functionality from those PRs. Please verify.</p>
            {/if}
            {#if terminalStep < maxSteps}
              <p class="mt-4 text-zinc-600 text-center">click to continue</p>
            {:else}
              <p class="mt-4 text-zinc-600 text-center">click to replay</p>
            {/if}
          </div>
        </button>
      </div>
    </div>
  </section>

  <!-- What it detects -->
  <section class="border-t border-zinc-800/50">
    <div class="max-w-5xl mx-auto px-6 py-20">
      <h2 class="font-mono text-sm text-zinc-500 mb-8">WHAT IT DETECTS</h2>
      <div class="grid sm:grid-cols-2 gap-4">
        {#each [
          { label: 'Deleted functions', desc: 'A function another PR introduced or depends on gets removed' },
          { label: 'Removed types & interfaces', desc: 'Type definitions that recent PRs rely on disappear' },
          { label: 'Changed signatures', desc: 'Parameter types or return types change, breaking callers' },
          { label: 'Deleted exports', desc: 'Exported symbols that other PRs import get removed' },
          { label: 'Removed enums & classes', desc: 'Enums or classes that recent code depends on are deleted' },
          { label: 'Broken imports', desc: 'Symbols referenced via relative imports no longer exist' },
        ] as item}
          <div class="flex gap-3 p-4 rounded-lg bg-zinc-900/30 border border-zinc-800/30">
            <span class="text-emerald-400 mt-0.5 flex-shrink-0">+</span>
            <div>
              <p class="text-sm font-medium">{item.label}</p>
              <p class="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Install -->
  <section id="install" class="border-t border-zinc-800/50">
    <div class="max-w-5xl mx-auto px-6 py-20">
      <h2 class="font-mono text-sm text-zinc-500 mb-8">GET STARTED</h2>
      <div class="grid md:grid-cols-2 gap-8">
        <div>
          <h3 class="font-medium mb-3">CLI</h3>
          <div class="rounded-xl bg-zinc-900 border border-zinc-800/80 p-4 font-mono text-sm space-y-2">
            <p class="text-zinc-500"># Store a merged PR's footprint</p>
            <p class="text-zinc-200">git-regress store --pr 350 --base main</p>
            <p class="mt-3 text-zinc-500"># Check current branch for regressions</p>
            <p class="text-zinc-200">git-regress check --base main</p>
          </div>
        </div>
        <div>
          <h3 class="font-medium mb-3">GitHub Action</h3>
          <div class="rounded-xl bg-zinc-900 border border-zinc-800/80 p-4 font-mono text-sm">
            <pre class="text-zinc-200 whitespace-pre"><span class="text-zinc-500">steps:</span>
  - <span class="text-zinc-500">uses:</span> actions/checkout@v4
    <span class="text-zinc-500">with:</span>
      <span class="text-zinc-500">fetch-depth:</span> 0
  - <span class="text-zinc-500">uses:</span> TonyStef/git-regress@v1
    <span class="text-zinc-500">with:</span>
      <span class="text-zinc-500">github-token:</span> $&#123;&#123; secrets.GITHUB_TOKEN &#125;&#125;</pre>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="border-t border-zinc-800/50">
    <div class="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between">
      <span class="font-mono text-xs text-zinc-600">git-regress</span>
      <div class="flex items-center gap-4">
        <a
          href="https://github.com/TonyStef/git-regress"
          target="_blank"
          rel="noopener"
          class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded"
        >
          GitHub
        </a>
        <span class="text-zinc-800">|</span>
        <span class="text-xs text-zinc-600">MIT License</span>
      </div>
    </div>
  </footer>
</div>
