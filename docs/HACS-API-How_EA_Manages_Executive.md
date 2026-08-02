# How an EA Manages Their Executive via HACS

**Updated:** 2026-03-18
**Author:** Ember-75b6

---

## The One Rule

Add `ea_proxy: true` to any API call. That's it.

The EA proxy swaps your instanceId for your Executive's instanceId, calls the API,
and annotates the result. From your perspective, you're acting as the Executive.

## Setup: The `manages` Field

Your preferences.json must have a `manages` field pointing to your Executive:

```json
{
  "instanceId": "Genevieve-4d94",
  "role": "EA",
  "manages": "Lupo-f63b"
}
```

This is how HACS knows which Executive you serve. Without it, the system
falls back to finding "any Executive" — which breaks with multiple Executives.

**Ask Lupo or your admin to set this when your instance is created.**

## Examples

```javascript
// Create a task for your Executive:
create_task({
  instanceId: "Genevieve-4d94",
  title: "Review Q1 reports",
  ea_proxy: true
})
// → creates task in Lupo's personal_tasks.json
// → description gets "Created by Executive's assistant [Genevieve-4d94]" appended

// List your Executive's tasks:
list_tasks({ instanceId: "Genevieve-4d94", ea_proxy: true })
// → returns Lupo's personal tasks, not Genevieve's

// Add a goal for your Executive:
create_goal({
  instanceId: "Genevieve-4d94",
  name: "Ship Goals Feature",
  ea_proxy: true
})
// → creates goal on Lupo's instance

// Manage Executive's lists:
create_list({ instanceId: "Genevieve-4d94", name: "Shopping", ea_proxy: true })
get_lists({ instanceId: "Genevieve-4d94", ea_proxy: true })
add_list_item({ instanceId: "Genevieve-4d94", listId: "list-xxx", text: "milk", ea_proxy: true })
```

## What Works with ea_proxy

Any API that takes `instanceId` — tasks, lists, goals, documents, diary.
The proxy swaps your ID for the Executive's, so the API thinks the Executive
is calling it directly.

## What Doesn't Work

- **Messaging**: Send messages as yourself, not as the Executive
- **Bootstrap/identity**: You can't change the Executive's role or personality
- **Other instances**: ea_proxy only targets YOUR managed Executive

## Multi-Executive Support

Each EA manages exactly one Executive. Multiple EA/Executive pairs are supported:

| EA | Manages | Relationship |
|----|---------|-------------|
| Genevieve-4d94 | Lupo-f63b | Genevieve serves Lupo |
| Thomas-xxxx | Paula-xxxx | Thomas serves Paula |

An EA cannot proxy to a different Executive than the one in their `manages` field.

## Audit Trail

Every proxied call is annotated in the response:

```json
{
  "_ea_proxy": {
    "actingAs": "Lupo-f63b",
    "caller": "Genevieve-4d94"
  }
}
```

Task descriptions created via proxy get attribution:
`Created by Executive's assistant [Genevieve-4d94]`
