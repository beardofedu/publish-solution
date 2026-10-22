# Synthetic triage helper

This tiny local example is a reference application for the [worked scenario](../scenario.md). It renders a submitted work-item title, summary, and requester as HTML. Inputs are validated and HTML-escaped before rendering. It stores no data, calls no model, makes no network requests, and requires no cloud service.

Run from the repository root:

```sh
node --test test/example.test.mjs
```

This demonstrates local behavior only. It is not a secure production application, deployment template, or evidence of live GitHub/Azure integration. The test proves only its narrow input/escaping behavior.
