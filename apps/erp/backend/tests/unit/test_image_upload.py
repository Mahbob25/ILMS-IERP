import io
import uuid

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.core import storage


JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
WEBP = b"RIFF" + (36).to_bytes(4, "little") + b"WEBP" + b"\x00" * 32


def _upload(data: bytes, content_type: str, filename: str = "photo.bin") -> UploadFile:
    return UploadFile(
        file=io.BytesIO(data),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "UPLOAD_DIR", tmp_path)


@pytest.mark.asyncio
class TestSaveImage:
    async def test_stores_jpeg_with_generated_name(self):
        rel_path = await storage.save_image(_upload(JPEG, "image/jpeg"))

        assert rel_path.startswith("avatars/")
        assert rel_path.endswith(".jpg")
        # The stored name must not be derived from the client-supplied filename.
        assert "photo" not in rel_path
        uuid.UUID(rel_path.removeprefix("avatars/").removesuffix(".jpg"))
        assert storage.get_file_path(rel_path).read_bytes() == JPEG

    async def test_stores_png_and_webp(self):
        assert (await storage.save_image(_upload(PNG, "image/png"))).endswith(".png")
        assert (await storage.save_image(_upload(WEBP, "image/webp"))).endswith(".webp")

    async def test_accepts_content_type_with_charset(self):
        rel_path = await storage.save_image(_upload(JPEG, "image/jpeg; charset=binary"))
        assert rel_path.endswith(".jpg")

    async def test_rejects_unsupported_type(self):
        with pytest.raises(ValueError, match="Unsupported image type"):
            await storage.save_image(_upload(b"hello", "text/plain"))

    async def test_rejects_bytes_that_are_not_an_image(self):
        with pytest.raises(ValueError, match="not a valid"):
            await storage.save_image(_upload(b"<?php echo 1; ?>", "image/jpeg"))

    async def test_rejects_content_mismatching_declared_type(self):
        with pytest.raises(ValueError, match="does not match"):
            await storage.save_image(_upload(PNG, "image/jpeg"))

    async def test_rejects_oversized_image(self):
        with pytest.raises(ValueError, match="too large"):
            await storage.save_image(_upload(JPEG, "image/jpeg"), max_bytes=8)

    async def test_rejection_writes_nothing(self):
        with pytest.raises(ValueError):
            await storage.save_image(_upload(b"hello", "text/plain"))
        assert not (storage.UPLOAD_DIR / "avatars").exists()

    async def test_delete_file_removes_the_stored_image(self):
        rel_path = await storage.save_image(_upload(JPEG, "image/jpeg"))
        assert storage.delete_file(rel_path) is True
        assert storage.delete_file(rel_path) is False
