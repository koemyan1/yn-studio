# Option photos disappearing after editing a product
Saving an edited product deleted every option photo file from storage, then re-saved the options pointing at those same (now deleted) files.
Now only photos that were replaced, cleared, or belong to removed options are deleted; untouched photos are kept. No SQL needed, just deploy.
Photos already lost must be uploaded again once (the files are gone from storage).
