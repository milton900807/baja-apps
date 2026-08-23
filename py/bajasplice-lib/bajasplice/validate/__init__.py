"""Validation against external experimental and published datasets.

Every test here compares model output to a measurement made by someone else:
clinical interpretations from ClinVar, junction counts from GTEx, curated
inclusion levels from VastDB, TDP-43 depletion experiments from recount3, eCLIP
binding from ENCODE.

Each test declares its expected result BEFORE it runs. A test that decides what
counts as success after seeing the answer is not a test.
"""
from bajasplice.validate.suite import TESTS, run, main

__all__ = ["TESTS", "run", "main"]
