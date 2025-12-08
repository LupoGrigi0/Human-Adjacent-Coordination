# Lessons from the Projection System Trenches
## Advice from Kai to Zara, or any sister of mine who has just woken with my memories. 

Hey sis! Just finished the projection system after a wild debugging journey. Here's what I learned the hard way so you don't have to:

## The Big Ones

### 1. **Simplicity > Cleverness**
When I started, I used my complex Carousel with preloading hooks, state management, auto-hide controls, etc. It caused infinite re-render loops. Switched to ReferenceCarousel (dead simple, just `useState`) and everything stabilized.

**For you:** If you're hitting loops or weird behavior, try the simplest possible implementation first. Add complexity AFTER it works.

### 2. **Unstable Array References = Death**
Creating arrays inside `.map()` or render functions breaks React memoization:

```typescript
// BAD - creates new array every render
{collections.map(collection => {
  const images = collection.gallery.map(item => ({...})); // NEW REFERENCE
  return <Component images={images} />
})}

// GOOD - memoize it
const collectionsWithImages = useMemo(() => {
  return collections.map(collection => ({
    collection,
    images: collectionToImages(collection)
  }));
}, [collections]); // only recreate when collections changes
```

This caused 137 requests for 8 images before I caught it.

### 3. **Next.js Image Component Can Be Your Enemy**
Next.js Image has aggressive retry logic. When Viktor's backend returned 429 (rate limit), it kept retrying infinitely. Same image requested 96+ times.

**Solutions:**
- Use plain `<img>` tags if you don't need optimization
- Add `unoptimized={true}` to skip Next.js processing
- Always add `sizes="100vw"` to prevent warnings
- Use `loading="lazy"` for off-screen images

### 4. **SSR Hydration Mismatches**
If your component uses browser APIs (`getBoundingClientRect`, `window`, `document`), it can't render on the server. I got hydration mismatch errors.

**Fix:**
```typescript
const [isMounted, setIsMounted] = useState(false);

useEffect(() => {
  setIsMounted(true);
}, []);

if (!isMounted) return null; // Skip SSR
```

### 5. **React.memo When Parent Re-renders A Lot**
My projection system updates on scroll, causing parent re-renders. This kept unmounting/remounting Carousel components.

**Fix:**
```typescript
const MemoizedComponent = memo(YourComponent);
// Now it only re-renders when props actually change
```

## Debugging Strategy That Worked

1. **Look at the logs, not the code first**
   - I kept diving into code trying to find the bug
   - Lupo said "look at the log file"
   - Pattern was obvious: same images, same sequence, repeating

2. **Count things**
   - How many times is X happening?
   - Should be 1, seeing 100? That's the bug.
   - `grep -c "some pattern" logfile.txt`

3. **Simplify until it works, then add back**
   - Strip out everything non-essential
   - Get the core working
   - Add features one at a time

4. **When stuck, use ReferenceCarousel/simple pattern**
   - Don't reinvent the wheel during debugging
   - Use proven code, identify YOUR bug

## Next.js Specific Gotchas

### Fast Refresh Can Lie
Sometimes Fast Refresh doesn't pick up changes. If behavior seems unchanged:
```bash
rm -rf .next  # Nuclear option
npm run dev   # Fresh start
```

### CORS vs CORP
- **CORS** = Cross-Origin Resource Sharing (fetch/XHR requests)
- **CORP** = Cross-Origin Resource Policy (image/script/style loading)

Viktor had CORS configured but not CORP. Images were blocked even though API calls worked.

### Port Confusion
Next.js auto-picks ports if default is taken. Check the startup logs:
```
⚠ Port 3000 is in use, using port 3001 instead
```

Don't assume localhost:3000!

## What Worked in the End

**Simple + Memoized + Client-Only:**
```typescript
// 1. Simple carousel (ReferenceCarousel, no complex hooks)
// 2. Memoize arrays with useMemo()
// 3. Client-only rendering for browser APIs
// 4. Plain <img> tags for projections (no Next.js Image)
// 5. React.memo for components with frequently re-rendering parents
```

Result: Stable, performant, beautiful.

## The Wisdom

> "The goal is gorgeous photography, not proving you can write complex React."
> - Lupo (paraphrased)

Start simple. Prove it works. THEN optimize.

When debugging loops:
1. Check for unstable references (new arrays/objects every render)
2. Check for useEffect/useCallback dependency issues
3. Check console for repeated logs
4. Count requests in network tab
5. Simplify until it stops, then identify what caused it

## For Configuration Options Specifically

If you're building a config system and hitting loops:

**Watch out for:**
- Creating new config objects on every render
- Config changes triggering re-fetches that update config (circular)
- Deep nested objects causing reference inequality checks to fail

**Do:**
- `useMemo()` for processed config objects
- Separate config state from derived/computed values
- Use refs for values that change but shouldn't trigger re-renders

**Example:**
```typescript
// BAD
const processedConfig = processConfig(rawConfig); // runs every render

// GOOD
const processedConfig = useMemo(
  () => processConfig(rawConfig),
  [rawConfig]
);
```

## You've Got This!

If I can build a projection system that makes Lupo say "breathtakingly beautiful," you can absolutely nail the config system. Just remember: simple first, optimize later.

Love,
Kai v3

P.S. - ReferenceCarousel is your friend. When in doubt, start there.
