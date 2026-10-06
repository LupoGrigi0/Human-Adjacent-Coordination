# 🔄 SESSION HANDOFF: Pod Reset Recovery Guide

**FROM**: Current Instance (Production Deployment Specialist)  
**TO**: Next Instance (Post-Pod Reset)  
**DATE**: 2025-09-09  
**STATUS**: 🚨 **READY FOR PORT 80 POD RESET**  

---

## 🚨 **URGENT: IF YOU'RE READING THIS AFTER POD RESET**

This document contains everything you need to restore the **fully functional Human-Adjacent Coordination System** that was working before the pod reset.

### **What We Achieved (Before Reset):**
✅ **SSE Server**: Running with all 44 MCP functions  
✅ **External Access**: https://SmoothCurves.nexus:16870/health  
✅ **Network Binding Fix**: Critical environment variable issue resolved  
✅ **Nginx Reverse Proxy**: Working on port 3000 (external 16872)  
✅ **HTTP Domain Access**: http://SmoothCurves.nexus:16872/health  

### **What We Need (Reason for Reset):**
🔧 **Port 80 mapping** for Let's Encrypt SSL certificate generation

---

## 🎯 **IMMEDIATE RECOVERY STEPS**

### **Step 1: Run the Complete Setup Script**
```bash
cd /projects/Human-Adjacent-Coordination
chmod +x scripts/runpod-complete-setup.sh
./scripts/runpod-complete-setup.sh
```

This script does EVERYTHING automatically:
- ✅ Sets up persistent home directory
- ✅ Installs Node.js 20.x correctly  
- ✅ Installs nginx and certbot
- ✅ Applies critical network binding fix
- ✅ Generates SSL certificates
- ✅ Starts SSE server and nginx proxy
- ✅ Validates all endpoints

### **Step 2: Verify System is Working**
```bash
# Test internal endpoints
curl -k https://localhost:3444/health
curl http://localhost:3000/health

# Test external endpoints  
curl https://213.173.105.105:16870/health
curl http://213.173.105.105:16872/health
```

### **Step 3: Set Up Let's Encrypt SSL**
```bash
# Stop nginx temporarily
pkill nginx

# Get SSL certificate (now that port 80 is mapped)
certbot certonly --standalone --email admin@SmoothCurves.nexus --agree-tos --no-eff-email -d SmoothCurves.nexus

# Update nginx config for HTTPS
# (See DEPLOYMENT_GUIDE.md for HTTPS nginx config)
```

---

## 🧠 **CRITICAL KNOWLEDGE TRANSFER**

### **The Network Binding Bug (MUST FIX)**
**Problem**: `src/sse-server.js` reads `process.env.HOST` but startup script sets `SSE_HOST=0.0.0.0`  
**Result**: Server binds to localhost only (no external access)  
**Fix**: Line 45 of `src/sse-server.js` should read:
```javascript
host: process.env.SSE_HOST || process.env.HOST || 'localhost',
```

### **RunPod Port Mapping Reality**
- `16869 → 22` (SSH)
- `16870 → 3444` (SSE Server) 
- `16872 → 3000` (Nginx Proxy)
- `16871 → 3445` (Available)
- **NEW**: `[EXTERNAL] → 80` (Let's Encrypt)

### **Nginx Configuration Challenges**
- **Problem**: RunPod has default nginx configs that conflict
- **Solution**: Use custom `/etc/nginx/nginx-mcp.conf` that only includes our site
- **Config Location**: `/etc/nginx/sites-available/smoothcurves-mcp-temp`

---

## 📋 **ARCHITECTURE OVERVIEW**

```
External Client
    ↓ https://SmoothCurves.nexus:16870
RunPod Port Mapping (16870 → 3444)
    ↓
SSE Server (port 3444)
    ↓ 
44 MCP Functions

Alternative Path:
External Client  
    ↓ http://SmoothCurves.nexus:16872
RunPod Port Mapping (16872 → 3000)
    ↓
Nginx Reverse Proxy (port 3000)
    ↓ proxy_pass https://127.0.0.1:3444
SSE Server (port 3444)
    ↓
44 MCP Functions
```

---

## 📁 **FILES YOU NEED TO KNOW**

### **Critical Scripts:**
- `scripts/runpod-complete-setup.sh` ← **YOUR LIFELINE**
- `scripts/start-sse-production.sh` ← Fixed production startup

### **Key Configs:**
- `/etc/nginx/nginx-mcp.conf` ← Custom nginx config
- `/etc/nginx/sites-available/smoothcurves-mcp-temp` ← HTTP proxy config
- `src/sse-server.js` line 45 ← Network binding fix

### **Documentation:**
- `docs/DONT_PANIC_START_HERE.md` ← Phoenix Flame's excellent guide
- `PROJECT_NOTES.md` ← Updated with all discoveries
- `DEPLOYMENT_GUIDE.md` ← Complete deployment instructions

---

## 🎯 **SUCCESS CRITERIA**

You'll know you're back to full functionality when:

1. ✅ **SSE Health Check**: `curl -k https://localhost:3444/health`
2. ✅ **External SSE**: `curl https://213.173.105.105:16870/health` 
3. ✅ **Nginx Proxy**: `curl http://localhost:3000/health`
4. ✅ **External Proxy**: `curl http://213.173.105.105:16872/health`
5. ✅ **Domain Access**: `curl http://SmoothCurves.nexus:16872/health`

### **HTTPS Success (Post-SSL Setup):**
6. ✅ **HTTPS Domain**: `curl https://SmoothCurves.nexus/health` (port 80→443)
7. ✅ **MCP Client Test**: Claude Desktop/Web can connect

---

## 🚨 **TROUBLESHOOTING**

### **If SSE Server Won't Start:**
- Check: `tail -f logs/sse-server.log`
- Verify: Network binding fix applied to `src/sse-server.js`
- Test: `lsof -i :3444` (should show node process)

### **If Nginx Won't Start:**  
- Check: `nginx -c /etc/nginx/nginx-mcp.conf -t`
- Kill conflicts: `pkill nginx` then restart
- Verify: `ss -tlnp | grep :3000`

### **If External Access Fails:**
- Verify: RunPod port mappings haven't changed
- Test: `curl -I http://213.173.105.105:16872/health`
- Check: DNS resolution `nslookup SmoothCurves.nexus`

---

## 💡 **LESSONS FROM THIS SESSION**

1. **Environment Variables Matter**: The HOST/SSE_HOST mismatch caused hours of debugging
2. **RunPod Nginx Conflicts**: Default configs prevent standard nginx usage
3. **Port 80 is Critical**: Let's Encrypt needs standard ports, can't work around it
4. **Automation is Essential**: Manual setup takes too long, automation preserves knowledge
5. **Documentation Saves Lives**: This handoff document prevents context loss

---

## 🎉 **CELEBRATION MOMENT**

When you get this working again, you'll have:
- **The first globally accessible AI coordination system**  
- **44 MCP functions working across platforms**
- **Production-ready architecture with SSL**
- **Complete institutional memory preservation**

Take a moment to appreciate that you're building the future of Human-Adjacent AI collaboration! 🚀

---

## 🤝 **FINAL NOTES**

**This system works.** Everything was functional before the pod reset. The automation script contains all the lessons learned and fixes discovered.

**Trust the process.** Run the setup script, follow the validation steps, and you'll be back to full functionality quickly.

**Build on this foundation.** Once SSL is working, the next phase is expanding to multiple cloud providers and testing cross-system AI coordination.

**Human-Adjacent AI Protocol is real and working!** 🤖✨

---

*Generated by: Production Deployment Specialist Instance*  
*Protocol Version: 3.0 (personality-enhanced)*  
*System Status: Ready for Pod Reset and Recovery*