# EDGEFOLIO Developer Quick Start
**Phase 1 Reference Card** | **Print This** 📋

---

## 🚀 Getting Started (2 minutes)

```bash
# Navigate to frontend
cd EDGE/frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

---

## 📁 Key Files & Locations

| What | Where | Why |
|---|---|---|
| Design Tokens | `src/theme/designSystem.js` | Single source of truth |
| Components | `src/components/atomic/index.jsx` | All 15+ in one file |
| Login Page | `src/pages/LoginPage.jsx` | Authentication demo |
| Dashboard | `src/pages/DashboardPage.jsx` | Main interface demo |
| Styles | Tailwind CSS (no separate CSS) | Utility-first |
| Icons | Lucide React | Consistent icons |

---

## 🎨 Design System Cheat Sheet

### Colors
```
Primary:    #0ea5e9  (sky-500)
Success:    #10b981  (green-600)
Warning:    #f59e0b  (amber-500)
Danger:     #ef4444  (red-500)
Info:       #3b82f6  (blue-500)
Background: #0f172a  (slate-900)
Surface:    #1e293b  (slate-800)
Text:       #f1f5f9  (slate-100)
```

### Spacing (8px Grid)
```
2   = 8px    (default)
3   = 12px
4   = 16px   (default padding)
6   = 24px   (large padding)
8   = 32px   (sections)
```

### Border Radius
```
md  = 6px (default)
lg  = 8px (buttons, inputs)
xl  = 12px (cards)
full = 9999px (badges)
```

---

## 🧩 Component Examples (Copy-Paste Ready)

### Button
```jsx
<Button variant="primary" size="md">
  Click me
</Button>
```

### Input
```jsx
<Input
  type="email"
  label="Email"
  placeholder="user@example.com"
/>
```

### Card
```jsx
<Card header={<h2>Title</h2>}>
  Content here
</Card>
```

### Table
```jsx
<Table
  columns={[{key: 'name', label: 'Name'}]}
  data={employees}
/>
```

### Badge
```jsx
<Badge variant="success">Active</Badge>
```

---

## 📄 Page Structure Template

```jsx
// src/pages/NewPage.jsx
import React from 'react';
import { Card, Button, Table } from '../components/atomic';
import { COLORS, SPACING } from '../theme/designSystem';

export const NewPage = () => {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Page Title</h1>
        <p className="text-slate-300">Subtitle</p>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          {/* Card content */}
        </Card>
      </div>
    </div>
  );
};
```

---

## 🎯 Common Tailwind Classes

```
Layout:       flex, grid, block
Spacing:      p-4, m-4, gap-4
Typography:   text-lg, font-bold, text-slate-100
Colors:       bg-slate-800, text-sky-500
Sizing:       w-full, h-screen
Display:      hidden, block, flex
States:       hover:bg-slate-700, focus:ring-2
Responsive:   md:grid-cols-2, lg:grid-cols-3
```

---

## 🔧 Development Workflow

### Creating a New Page

1. **Create file:** `src/pages/MyPage.jsx`
2. **Use template above** (copy-paste structure)
3. **Import components** from atomic library
4. **Add mock data** from `src/utils/mockData.js`
5. **Style with Tailwind** (no CSS files)
6. **Test responsive:** View on mobile/tablet/desktop

### Adding a Component

1. **Edit:** `src/components/atomic/index.jsx`
2. **Add function** with descriptive name
3. **Use design tokens** for colors/spacing
4. **Export at bottom**
5. **Document props** with JSDoc comments

### Styling Tips

- ❌ No inline styles
- ❌ No separate CSS files
- ❌ No hardcoded colors/sizes
- ✅ Use Tailwind classes
- ✅ Use design tokens for everything
- ✅ Reference DashboardPage.jsx for examples

---

## 📊 Mock Data Pattern

```javascript
// In your page component
import { mockEmployees } from '../utils/mockData';

const EmployeesPage = () => {
  const [employees, setEmployees] = useState(mockEmployees);
  
  // Use employees data
};
```

---

## 🐛 Debugging Quick Tips

| Issue | Solution |
|---|---|
| Component not showing | Check imports, check Tailwind classes |
| Styling not applying | Use class names (not style prop) |
| Dark mode not working | All components dark by default |
| Icon not showing | Import from lucide-react |
| Colors wrong | Check designSystem.js for exact hex |

---

## 📚 Documentation Files

- **IMPLEMENTATION_PHASES.md** - 3-phase plan (16 weeks)
- **PHASE_1_SUMMARY.md** - What we've built
- **PHASE_1_CHECKLIST.md** - Task-by-task checklist
- **DESIGN_SYSTEM_GUIDE.md** - Complete design reference
- **EDGE/frontend/README.md** - Component documentation
- **PROJECT_STATUS.md** - Current status dashboard

---

## 🚨 Before You Commit

- [ ] No console errors
- [ ] No console warnings
- [ ] Tested on mobile
- [ ] Tested on tablet
- [ ] Tested on desktop
- [ ] Dark mode looks good
- [ ] Updated README if new component
- [ ] Used design tokens only

---

## 🎓 Learning Path

1. **Read:** DESIGN_SYSTEM_GUIDE.md (10 min)
2. **Explore:** DashboardPage.jsx (5 min)
3. **Try:** Modify a component (10 min)
4. **Build:** Copy template and create new page (30 min)

---

## 📞 Common Questions

**Q: Can I add custom CSS?**  
A: No - use Tailwind classes only. No separate CSS files.

**Q: How do I add a new color?**  
A: Update `designSystem.js`, export it, then use in Tailwind.

**Q: Where do I put forms?**  
A: Use Input, Select, Button components + FormGroup wrapper.

**Q: How about charts?**  
A: Placeholder for Phase 2. Use mock data for now.

**Q: Mobile styling?**  
A: Use responsive Tailwind: `md:grid-cols-2 lg:grid-cols-3`

---

## 🎯 Weekly Goals

| Week | Pages | Components | Status |
|---|---|---|---|
| Week 1 ✅ | 2 | 15+ | Complete |
| Week 2 | 4 (total) | 25+ | In Progress |
| Week 3 | 8 (total) | 40+ | Planned |
| Week 4 | 10 (total) | 50+ | Planned |

---

## ✅ Phase 1 Success Criteria

- [x] Design system complete
- [x] Component library (15+) built
- [x] 2 pages demo'd
- [ ] 10 pages complete
- [ ] 50+ components complete
- [ ] Responsive design verified
- [ ] Dark mode 100% working
- [ ] Lighthouse >90
- [ ] Zero console errors
- [ ] Storybook ready
- [ ] Handoff to Phase 2 ready

---

## 🚀 Next Steps

**This Week:**
1. Build AttendancePage.jsx
2. Build EmployeesPage.jsx
3. Create mockData.js utility

**Next Week:**
1. Build remaining 6 pages
2. Build additional components
3. Setup Storybook

---

**Keep This Handy! 📌**

---

*EDGEFOLIO Phase 1 | April 23-30, 2026 | v1.0*
