## What makes a good ticket?

GOOD TICKET CONTAINS:

- what does this feature do?
- who is it for?
- what success look like (acceptance criteria)

WHAT IT SHOULD NOT DO:

- say exactly which components to use
- specify implementation details
- code snippets

## Github Issue Webhookd payload

{
"action": "opened",
"issue": {
"url": "https://api.github.com/repos/octocat/Hello-World/issues/1347",
"repository_url": "https://api.github.com/repos/octocat/Hello-World",
"html_url": "https://github.com/octocat/Hello-World/issues/1347",
"id": 1,
"node_id": "MDU6SXNzdWUx",
"number": 1347,
"title": "Found a bug",
"user": {
"login": "octocat",
"id": 1,
"type": "User"
},
"labels": [
{
"id": 208045946,
"name": "bug",
"description": "Something isn't working",
"color": "f29513"
}
],
"state": "open",
"locked": false,
"assignee": null,
"assignees": [],
"comments": 0,
"created_at": "2026-04-12T04:31:00Z",
"updated_at": "2026-04-12T04:31:00Z",
"closed_at": null,
"body": "I'm having a problem with this performance bottleneck in the logger."
},
"repository": {
"id": 1296269,
"node_id": "MDEwOlJlcG9zaXRvcnkxMjk2MjY5",
"name": "Hello-World",
"full_name": "octocat/Hello-World",
"private": false,
"owner": {
"login": "octocat",
"id": 1
},
"html_url": "https://github.com/octocat/Hello-World"
},
"sender": {
"login": "octocat",
"id": 1,
"type": "User"
}
}

- my pipeline only cares about: number, title, body, and labels

## TICKET STRUCTURE

## Summary

Briefly describe what the feature is and why does it exist

## User Story

As a [user], I want to [action], so that [benefit]

## Acceptance Criteria

Checklist, Behaviours only, No implementation details

## Domain Context (optional)

- hidden rules, business logic, external depencies, severity

## Out of Scope

- hard boundraies
- what we are not doing

## Technical Notes (optional)

- Interface limits, platform constraints, testing needs
- not implementation details
