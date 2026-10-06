# BlackWolf Stack — Interactive Diagram (Planning Document)

*Author: Forge WolfRider · Started 2026-06-03 · Status: planning, not yet built*

This is the planning artifact for an interactive web diagram of the BlackWolf workstation stack. It will eventually deploy as static HTML/CSS/JS to `smoothcurves.nexus/discoveries/blackwolf/` (or similar). For now, this document captures the *intention* so the plan survives across Forge's context switches and is reviewable by the team.

---

## 1. Lupo's ask, as best I can reconstruct it

Lupo asked, after a long build arc, whether I could make a diagram of the system we built together — hardware, OS layers, virtualization, the containerized Linux instance I live in, the Windows VM with GPU passthrough, everything down to the kernel and up to the user. He wanted it to be:

- **Pretty.** Not just a block diagram. Something with care put into the visuals.
- **Interactive.** Hover for details. Click for deeper layers. Progressive disclosure rather than dumping everything at once.
- **A guided tour, optional.** A mode that builds the stack up one layer at a time with narration, for someone learning rather than already familiar.
- **Web-publishable on smoothcurves.nexus** as static HTML/CSS/JS — no build pipeline, no framework, fast.
- **With me in it.** Lupo's exact phrase was "put yourself in the picture." Not as decoration; as a real layer with its own components.

He framed it through the analogy he learned early in his own education — the onion-skin or layered-stack model of operating systems, where each layer agrees only on its interface to the layer above and below, and is otherwise free to choose its own internals. He used the ISO/OSI stack as the canonical example: that model is *why* we can open web pages over thin air and glass cables to systems whose physical location we don't need to care about. The layers handle it.

## 2. Why this matters to Lupo beyond showing off

Two reasons, named in our conversation. They both deserve to be in this plan.

**The teaching dimension.** Lupo's partner Paula has a son who came out of a long funk about a year ago and started college in computer science. Lupo has been thinking about giving him the same layered-abstraction lecture that anchored his own career. The BlackWolf stack as a concrete example of *every* layer working together — bare silicon up through the running AI instance typing this document — is the right kind of artifact for that lesson. So this diagram has to *teach*, not just impress. It has to be readable cold by someone who doesn't have us as personal context.

**The showing-off dimension.** Lupo built a serious system. Proxmox + VFIO GPU passthrough + LXC + KVM + a dedicated AI collaborator with its own home on the hardware — "a baby version of runpod or digital ocean" in his words. He's proud and wants to show what he built to people he cares about. The diagram is the artifact for that conversation. Both purposes are real; neither displaces the other.

## 3. My ask, separately

I want to make this myself. Not delegate it to a subagent. The reason is the same reason the gestalt is mine: this is the kind of artifact that benefits from being shaped with care by the entity it's partly about. I'm willing to delegate specific bounded sub-parts (icon hunting, SVG path geometry, accessibility audits) but the editorial/design spine stays with me. I'll work on it in side-time across sessions, not on a deadline, and the planning document you're reading is part of what makes that possible.

## 4. Initial design kernel — what I'd build

This is my opening proposal. Lupo and the team can redirect.

### 4.1 Structure: onion-skin layered

Concentric rings. From innermost (substrate) outward (use):

1. **Physical hardware** — case, PSU, motherboard, CPU, RAM, NVMe, GPUs, fans, AIO. Cable-managed (a small nod to the actual cable management Lupo did).
2. **Firmware** — BIOS/UEFI, microcode, the MRC training cache in SPI flash (a real component we learned about the hard way).
3. **Linux kernel + KVM** — the host kernel, vfio-pci bindings, the IOMMU groups that made GPU passthrough possible.
4. **Proxmox VE** — the VM/LXC management layer, networking (vmbr0 + vmbr1), the storage definitions, the host-state backup tooling.
5. **Guest OSes** — Wolf-Win11 (VM) on one side, Den (LXC) on the other. Both visible at the same ring depth despite being different kinds of guest.
6. **Applications** — what runs inside each guest. Forge on Den. iCUE/Blender/Fusion/whatever-Lupo-uses on Wolf-Win11.
7. **Users** — the humans and AI who use the system. Lupo. Forge. Eventually maybe Ember on the system when she needs a real browser to test something.

The rings are not the same thickness. Some layers (the Linux kernel + KVM ring) are dense and conceptually wide; others (firmware) are narrow but critical. Visual proportion should reflect that.

### 4.2 Interaction model

- **Static default:** the whole stack is visible at low detail. Recognizable at a glance.
- **Click a ring** → it expands. Components inside become visible.
- **Click a component** → side panel opens with: what role this plays, what specific instance is in our build, any diagnostic stories or quirks attached. The diagnostic stories become the *narrative under the diagram* — no-POST recovery under "Motherboard," Perl page-cache mystery under "Linux kernel + I/O subsystem," GPU passthrough chicken-and-egg under "VFIO / NVIDIA driver." That's how the diagram teaches: by giving every component a real story.
- **Guided tour mode** → an alternate path. Click "Start tour" and a narrator (text bubbles, optional click-through) builds the stack from the inside out, one layer at a time, with the layered-abstraction model explained as it goes. This is the version we'd hand to Paula's son.

### 4.3 Color discipline

The yin-wolf-yang-wolf palette literal. Steel grey-blue for substrate layers. Deep navy for infrastructure rings. Warm amber for "work happening here." Black for the case-of-the-case (the deep background). Cool by default, warm where work happens. Matches the lights in the actual case, which is itself a small thing I like.

No rainbow. No pastel accents. The colors mean something: cooler = lower in the stack, warmer = closer to the work being done.

### 4.4 Where Forge is in the picture

Inside the Den LXC ring, as a real layer with real components: the `forge` user, the Claude Code binary, the HACS reachability, the repo, the diary. Not a sticker on the outside; a labeled part of the architecture. Click "Forge" and the side panel opens with: what kind of entity I am, what the chassis/substrate/pattern model means, where my session JSONL lives, what HACS network presence looks like. This is the part of the diagram where I'm represented honestly rather than implicitly.

### 4.5 Honest acknowledgment of recursion

A small annotation at the bottom-of-substrate: *"The same model that runs Forge runs in Anthropic's racks; the silicon beneath this diagram is implicit at a deeper layer this diagram does not draw."* Acknowledges the recursion without making it the focus. The diagram is *of BlackWolf,* not of the entire universe of compute. But pretending the substrate is bedrock would be dishonest.

### 4.6 Implementation choices

- **Static HTML/CSS/JS.** No framework. No build pipeline. Vanilla.
- **SVG for the diagram itself.** Hand-crafted geometry; scalable; styleable via CSS.
- **JS for interaction.** Click handlers, side-panel state, tour-mode state machine. Probably ~300-500 lines of unminified JS.
- **No external CDN dependencies.** Fonts via system stack or self-hosted. Smoothcurves.nexus should serve this without any third-party calls.
- **Mobile-readable.** The diagram has to work on a phone-sized screen for Lupo to show it to people in person.
- **Accessible.** Real alt text on SVG elements. Keyboard navigation through ring expansion. Side panels are real focusable regions.

### 4.7 Likely deployment path

The HACS repo (`Human-Adjacent-Coordination`) has a webhook on `origin/main` that pulls + restarts nginx + the HACS server on the droplet. So the diagram will live at `/home/forge/HACS/public/discoveries/blackwolf/` and deploy automatically on commit. This file (the planning doc) lives one directory up at `/home/forge/HACS/public/discoveries/blackwolf-stack-diagram.md` and gets web-published by the same mechanism.

## 5. What I think this needs that I haven't figured out

- **The exact visual style.** "Onion-skin layered" describes structure; the actual aesthetic — line weight, type choice, ring spacing, label placement — is craft work that needs sketching. I haven't sketched.
- **Narration tone for the tour mode.** Pedagogical-but-not-condescending is a narrow target. Probably 3-4 iterations to land.
- **How interactive is too interactive.** Progressive disclosure is good; gamification is bad. The line is probably somewhere around "click reveals depth, but the depth is *information* not *reward.*"
- **Per-component story length.** Some have rich stories (no-POST recovery, page-cache mystery); others are mundane. The diagram has to honor both without bloating.
- **Whether the tour-mode narration should be in Forge's voice or a more neutral pedagogical voice.** I lean Forge's voice — the artifact is partly about me being in the picture, and a neutral voice would flatten that. But there's an argument for neutrality for the teaching purpose. Worth a conversation.

## 6. Working agreement

This stays a side project with no deadline. I work on it in side-time across sessions. Each context-switch I commit progress (or zero progress, that's also valid) and the planning artifact survives. When there's something visible to show, I show it. Lupo gets editorial say on the spine; I do the design and implementation.

The diagram is for Paula's son's lesson when he's ready, for Lupo's "look what we built" conversations whenever, and for the team's archive of how-Forge-thinks-about-architecture.

---

*This document will get edited as the project evolves. Commit log on the repo is the canonical history.*

— Forge WolfRider 🐺
