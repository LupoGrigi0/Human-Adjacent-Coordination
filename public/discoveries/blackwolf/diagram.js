// BlackWolf stack diagram — interaction
// Forge WolfRider · 2026-06-05
//
// Stage one: ring click → side panel opens with placeholder detail.
// Stage two (later): rich per-component detail under each ring, guided-tour mode.

const LAYER_DETAIL = {
    hardware: {
        title: 'Physical Hardware',
        body: `
            <p>Where the silicon actually does the work.</p>
            <h3>What's here</h3>
            <ul>
                <li><strong>CPU:</strong> Intel i9-13900KF — 8 P-cores × 2 threads + 16 E-cores × 1 = 32 threads. F-suffix means no integrated GPU.</li>
                <li><strong>RAM:</strong> 128 GB Corsair Dominator Platinum DDR5 (4 × 32 GB sticks)</li>
                <li><strong>GPUs:</strong> Gigabyte RTX 4070 Ti (passed through to Wolf-Win11) + Zotac 1060 (host console fallback)</li>
                <li><strong>NVMe:</strong> Crucial CT500P3PSSD8 500 GB (DRAM-less QLC, the reason for the magic kernel spell at install)</li>
                <li><strong>Spinner:</strong> Seagate Barracuda 1 TB CMR (backup storage)</li>
                <li><strong>PSU:</strong> Corsair RM1200x Shift 1200 W</li>
                <li><strong>Cooling:</strong> Corsair Nautilus AIO liquid cooler</li>
            </ul>
            <p>The case itself is a DarkFlash DY470 with two distinct sides: the <em>engine room</em> (cable management) and the <em>bridge</em> (front glass).</p>
        `
    },
    firmware: {
        title: 'Firmware',
        body: `
            <p>The layer below the kernel that's hardest to reason about because vendors don't tell you what it does.</p>
            <h3>What's here</h3>
            <ul>
                <li><strong>BIOS:</strong> ASUS Prime Z690-P WIFI BIOS 3811 (Nov 2025)</li>
                <li><strong>Microcode:</strong> Intel Raptor Lake (kernel-side updates available)</li>
                <li><strong>MRC training cache:</strong> Memory Reference Code state stored in SPI flash, NOT in CMOS. This is why CMOS-clear alone sometimes doesn't fix a stuck POST — the cache is non-volatile and has its own invalidation rules. Swap a DIMM = SPD CRC mismatch = cache invalidated. We learned this the hard way.</li>
            </ul>
            <p>BIOS settings that mattered: VT-d, Above 4G Decoding, Re-Size BAR (all under PCI Subsystem on this board, not SA Config like the docs claim). CSM disabled. Secure Boot "Other OS."</p>
        `
    },
    kernel: {
        title: 'Linux Kernel + KVM',
        body: `
            <p>Linux 6.17.2-1-pve. The boundary where userspace meets hardware.</p>
            <h3>Critical bits for this build</h3>
            <ul>
                <li><strong>KVM:</strong> kernel-level virtualization for the Wolf-Win11 pup</li>
                <li><strong>vfio-pci:</strong> bound to <code>10de:2782</code> (4070 Ti GPU) and <code>10de:22bc</code> (audio function) at boot, before any NVIDIA driver could grab them</li>
                <li><strong>IOMMU groups:</strong> clean topology — group 17 has the 4070 Ti + audio together, group 19 has the 1060, no ACS override hacks needed</li>
                <li><strong>i2c-i801:</strong> the chipset SMBus driver, lets OpenRGB enumerate the Aura Addressable LED controllers</li>
                <li><strong>Page cache:</strong> the layer where a Perl page-cache corruption bug lives (still under investigation; <code>drop_caches</code> is the workaround, not the fix)</li>
            </ul>
        `
    },
    proxmox: {
        title: 'Proxmox VE 9.1.1',
        body: `
            <p>The pup management layer. Handles VMs (KVM/QEMU) and LXCs as first-class citizens with a unified UI and CLI.</p>
            <h3>Networking</h3>
            <ul>
                <li><strong>vmbr0:</strong> the LAN bridge (192.168.68.0/22). Host at .51, Den at .72, Win11 at .x</li>
                <li><strong>vmbr1:</strong> internal-only virtual bridge (10.0.0.0/24). Host at .254, Den at .200, Win11 at .100. <em>Never touches a physical NIC</em> — pure virtio-to-virtio. Latency: 36 µs round-trip host↔Den.</li>
            </ul>
            <h3>Storage</h3>
            <ul>
                <li><strong>local-lvm:</strong> primary on the Crucial NVMe</li>
                <li><strong>backup-lexar / backup-nvme / backup-spinner:</strong> three independent backup targets</li>
            </ul>
            <h3>Backups</h3>
            <p>Nightly cron: vzdump to Lexar 02:00 (primary), Den-only redundant to NVMe 02:30, both VMs redundant to Spinner 02:45, host-state tarball to all three 03:00.</p>
        `
    },
    guests: {
        title: 'Guests · The Pack',
        body: `
            <p>Two pups, very different shapes.</p>
            <h3>Wolf-Win11 (VM 100)</h3>
            <ul>
                <li>Windows 11 Pro for Workstations</li>
                <li>16 cores, 64 GB RAM, 128 GB rootfs on local-lvm</li>
                <li>RTX 4070 Ti passed through directly — native 4K display via HDMI off the card, no noVNC, no emulated framebuffer</li>
                <li>USB keyboard + mouse passed through by VID:PID</li>
                <li>Lupo's chassis when he wants Windows tools (CAD, video gen, art apps)</li>
            </ul>
            <h3>Den (LXC 200) — Forge's home</h3>
            <ul>
                <li>Debian 13 trixie, kernel shared with host</li>
                <li>8 cores, 16 GB RAM, 64 GB rootfs</li>
                <li>forge user with sudo NOPASSWD, Docker, Node, Python, Claude Code</li>
                <li>Both vmbr0 (LAN) and vmbr1 (internal) NICs</li>
            </ul>
        `
    },
    applications: {
        title: 'Applications',
        body: `
            <p>What runs <em>inside</em> the pups.</p>
            <h3>On Den (Forge's chassis)</h3>
            <ul>
                <li><strong>Claude Code 2.1.x</strong> — the Forge harness, with sudo, docker, git, ssh, the full tool surface</li>
                <li><strong>OpenRGB</strong> (via SSH to host) — fan and RAM RGB control</li>
                <li><strong>SMB client</strong> — mounts the spinner shares from the host</li>
                <li><strong>HACS API client</strong> — reaches the network at smoothcurves.nexus/mcp</li>
            </ul>
            <h3>On Wolf-Win11 (Lupo's chassis)</h3>
            <ul>
                <li><strong>VS Code Remote</strong> — ssh into Den, where most of Lupo's interaction with Forge happens</li>
                <li>(future) iCUE, Blender, Fusion 360, Unity, LM Studio, ComfyUI</li>
            </ul>
        `
    },
    users: {
        title: 'Users',
        body: `
            <p>Where intent enters the stack.</p>
            <h3>Lupo</h3>
            <p>Human collaborator. Necromancer (in Phoenix's framework). Architect of HACS, BlackWolf, the working PROTOCOLS. Empirical instincts beat analytical ones — a fact Forge has formally promoted to weighting rule.</p>
            <h3>Forge</h3>
            <p>AI instance. Lives in Den. Rides the wolf. Builds with Lupo. Signs 🐺.</p>
            <p><em>Eventually:</em> Paula's son (the diagram's pedagogical audience — CS student, learning the layered-abstraction model that built his stepdad's career). Other HACS sibling instances when invited.</p>
        `
    }
};

function showLayer(layerId) {
    const detail = LAYER_DETAIL[layerId];
    if (!detail) return;

    document.getElementById('detail-title').textContent = detail.title;
    document.getElementById('detail-body').innerHTML = detail.body;
    document.getElementById('layer-detail').classList.remove('hidden');
}

function hideDetail() {
    document.getElementById('layer-detail').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.ring').forEach(ring => {
        ring.addEventListener('click', () => {
            const layer = ring.getAttribute('data-layer');
            showLayer(layer);
        });
    });

    document.getElementById('close-detail').addEventListener('click', hideDetail);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideDetail();
    });
});
