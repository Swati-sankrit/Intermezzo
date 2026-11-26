import { describe, it, expect } from 'vitest';
import { parseSvgMarkup } from '../gate/svgMarkup';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const BODY = '<rect width="10" height="10" fill="var(--shadow)"/>';
const parse = (markup: string) => parseSvgMarkup(markup, document);

describe('parseSvgMarkup namespace handling', () => {
  it('accepts a root without xmlns and puts it and its children in the SVG namespace', () => {
    const root = parse(`<svg viewBox="0 0 10 10">${BODY}</svg>`);
    expect(root).not.toBeNull();
    expect(root?.namespaceURI).toBe(SVG_NS);
    expect(root?.firstElementChild?.namespaceURI).toBe(SVG_NS);
    expect(root?.getAttribute('viewBox')).toBe('0 0 10 10');
  });

  it('accepts a root with the correct xmlns and keeps a single declaration', () => {
    const markup = `<svg xmlns="${SVG_NS}" viewBox="0 0 10 10">${BODY}</svg>`;
    const root = parse(markup);
    expect(root?.namespaceURI).toBe(SVG_NS);
    expect(root?.getAttribute('viewBox')).toBe('0 0 10 10');
    expect(root?.attributes.length).toBe(1);
  });

  it('adds nothing to a root with an xmlns written with single quotes and spacing', () => {
    const root = parse(`<svg xmlns = '${SVG_NS}'>${BODY}</svg>`);
    expect(root?.namespaceURI).toBe(SVG_NS);
  });

  it('rejects a root with a wrong xmlns', () => {
    expect(parse(`<svg xmlns="${XHTML_NS}">${BODY}</svg>`)).toBeNull();
  });

  it('rejects a root that is not svg, with or without xmlns', () => {
    expect(parse(`<div>${BODY}</div>`)).toBeNull();
    expect(parse(`<g xmlns="${SVG_NS}">${BODY}</g>`)).toBeNull();
    expect(parse('<svgx viewBox="0 0 1 1"/>')).toBeNull();
  });

  it('adds the namespace after an XML declaration and a comment', () => {
    const root = parse(`<?xml version="1.0"?><!-- c --><svg>${BODY}</svg>`);
    expect(root?.namespaceURI).toBe(SVG_NS);
  });

  it('gives a nested svg only the namespace the parser inherits, and no extra attributes', () => {
    const root = parse(`<svg><svg width="5">${BODY}</svg></svg>`);
    const inner = root?.firstElementChild;
    expect(inner?.localName).toBe('svg');
    expect(inner?.namespaceURI).toBe(SVG_NS);
    expect([...(inner?.attributes ?? [])].map((a) => a.name)).toEqual(['width']);
  });

  it('adds no xmlns:xlink and no other attribute to the root', () => {
    const root = parse(`<svg viewBox="0 0 1 1" focusable="false">${BODY}</svg>`);
    expect([...(root?.attributes ?? [])].map((a) => a.name).sort()).toEqual(['focusable', 'viewBox']);
  });

  it('accepts a self-closing root', () => {
    expect(parse('<svg/>')?.namespaceURI).toBe(SVG_NS);
  });
});

describe('parseSvgMarkup still rejects or strips unsafe content after the namespace is added', () => {
  it('rejects a script element', () => {
    const root = parse('<svg><script>alert(1)</script><rect width="1" height="1"/></svg>');
    expect(root?.querySelector('script')).toBeNull();
    expect(root?.innerHTML ?? '').not.toContain('alert');
  });

  it('rejects a foreignObject', () => {
    const root = parse('<svg><foreignObject><div>x</div></foreignObject><rect width="1" height="1"/></svg>');
    expect(root?.querySelector('foreignObject')).toBeNull();
    expect(root?.querySelector('div')).toBeNull();
  });

  it('drops an external href and an xlink:href', () => {
    const xlink = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
    const root = parse(`<svg ${xlink}><path d="M0 0" href="https://x.test/a"/><path d="M1 1" xlink:href="https://x.test/b"/></svg>`);
    for (const path of Array.from(root?.querySelectorAll('path') ?? [])) {
      expect(path.getAttribute('href')).toBeNull();
      expect(path.getAttribute('xlink:href')).toBeNull();
    }
  });

  it('drops on* handlers', () => {
    const root = parse('<svg onload="alert(1)"><rect onclick="alert(2)" width="1" height="1"/></svg>');
    expect(root?.hasAttribute('onload')).toBe(false);
    expect(root?.firstElementChild?.hasAttribute('onclick')).toBe(false);
  });

  it('still rejects empty and malformed input', () => {
    expect(parse('')).toBeNull();
    expect(parse('<svg><rect></svg>')).toBeNull();
  });
});
