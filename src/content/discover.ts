// Media element discovery: existing <video>/<audio> on load, new ones via
// MutationObserver, including inside open shadow roots (each discovered
// shadow root gets the same observer attached).

export type MediaFoundCallback = (el: HTMLMediaElement) => void;
export type MediaRemovedCallback = () => void;

export class MediaDiscovery {
  private readonly onFound: MediaFoundCallback;
  private readonly onRemoved: MediaRemovedCallback;
  private readonly observer: MutationObserver;
  private readonly observedRoots = new WeakSet<Node>();

  constructor(onFound: MediaFoundCallback, onRemoved: MediaRemovedCallback) {
    this.onFound = onFound;
    this.onRemoved = onRemoved;
    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
  }

  start(): void {
    this.observeRoot(document);
    this.scan(document);
  }

  stop(): void {
    this.observer.disconnect();
  }

  private observeRoot(root: Node): void {
    if (this.observedRoots.has(root)) return;
    this.observedRoots.add(root);
    this.observer.observe(root, { childList: true, subtree: true });
  }

  /** Walk a subtree, reporting media elements and descending into open
   *  shadow roots. */
  private scan(root: Node): void {
    if (root instanceof HTMLMediaElement) this.onFound(root);
    if (root instanceof Element && root.shadowRoot) {
      this.observeRoot(root.shadowRoot);
      this.scan(root.shadowRoot);
    }
    if (root instanceof Element || root instanceof Document || root instanceof ShadowRoot) {
      for (const el of root.querySelectorAll('*')) {
        if (el instanceof HTMLMediaElement) this.onFound(el);
        if (el.shadowRoot) {
          this.observeRoot(el.shadowRoot);
          this.scan(el.shadowRoot);
        }
      }
    }
  }

  private handleMutations(mutations: MutationRecord[]): void {
    let removedAny = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) this.scan(node);
      if (m.removedNodes.length > 0) removedAny = true;
    }
    if (removedAny) this.onRemoved();
  }
}
