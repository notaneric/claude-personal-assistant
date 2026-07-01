# /automate [task description]: Workflow Automation

Build automation workflows using n8n and Google Workspace CLI. From one-time scripts to recurring automated pipelines.

## Skills Activated
Primary: n8n  
Secondary: google-workspace-cli  
Support: excel-mcp (for data handling)

## Steps

1. **Classify the automation:**
   - One-time script vs. recurring workflow
   - Trigger: webhook, schedule (cron), event (email received, file created), manual
   - Integrations needed: Google (Drive/Gmail/Sheets/Calendar), APIs, databases, files

2. **n8n Workflow** (for multi-step integrations):
   
   Generate complete n8n workflow JSON:
   ```json
   {
     "name": "[Workflow Name]",
     "nodes": [
       {
         "name": "Trigger",
         "type": "n8n-nodes-base.[triggerType]",
         "parameters": {},
         "position": [0, 0]
       },
       {
         "name": "[Step Name]",
         "type": "n8n-nodes-base.[nodeType]",
         "parameters": {},
         "position": [200, 0]
       }
     ],
     "connections": {}
   }
   ```
   
   Ready to import via n8n UI → Workflows → Import

3. **Google Workspace CLI** (for G Suite operations):
   ```bash
   # Examples
   gws drive list --folder "Reports"
   gws gmail send --to "recipient@example.com" --subject "Weekly Report" --body report.md
   gws sheets update --id [spreadsheet_id] --range "A1:Z100" --data output.csv
   gws calendar create --title "Sprint Review" --start "2026-06-01T10:00" --duration 60
   ```

4. **Output:**
   - For n8n: workflow JSON + import instructions + credentials needed
   - For GWS: shell script with all commands + setup instructions
   - Error handling: what to do when steps fail
   - Testing: how to test before production

## Automation Shortcuts
- `/automate daily-report [data source]`, schedule daily report generation + delivery
- `/automate sync [A] to [B]`, sync data between two systems
- `/automate alert [condition]`, set up monitoring + notification workflow
- `/automate scrape [site]`, scheduled web scraping + data storage
- `/automate gmail [rule]`, Gmail filter + action workflow
