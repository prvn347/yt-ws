import { Application, Request, Response, Router } from "express";
import {
  channelInputParser,
  userSignInInputSchema,
  userSignupInputSchema,
} from "../utils/inputParser";
import fs from "fs/promises";
import { PrismaClient } from "@prisma/client";
import z from "zod";
import path from "path";
import bcrypt from "bcryptjs";
import { generateToken } from "../utils/jwtUtils";
import { cookieConfig } from "../config";
import { AuthRequest, user } from "../middleware/user";
import multer from "multer";
import supabase from "../storage";
const prisma = new PrismaClient();
const app = Router();
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    if (ext !== ".mp4" && ext !== ".mov" && ext !== ".avi") {
      return cb(new Error("Only video files are allowed."));
    }
    cb(null, true);
  },
});

app.get("/ping", (req: Request, res: Response) => {
  res.send("PONG");
});

app.post("/auth/signup", async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password, username } = req.body;

    const payloadParse = userSignupInputSchema.parse({
      username,
      email,
      password,
    });
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });
    if (existingUser) {
      res.status(409).json({
        message: "Email or username already exists",
      });
      return;
    }
    const hashedPassword = await bcrypt.hashSync(password, 10);
    const newUser = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
      },
    });

    return res.status(201).json({
      message: "User successfully registered",
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation errors",
        errors: error.errors,
      });
    }

    console.error("Error during signup:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.post("/auth/login", async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;

    const payloadParse = userSignInInputSchema.parse({ email, password });

    const existingUser = await prisma.user.findFirst({
      where: {
        email,
      },
    });
    if (!existingUser) {
      res.status(404).json({
        msg: "user not found",
      });
      return;
    }

    const hashedPassword = existingUser?.password;
    const isValidPassword = await bcrypt.compare(
      password,
      hashedPassword as string
    );

    if (!isValidPassword) {
      res.status(400).json({ msg: "incorrect password" });
      return;
    }

    const token = generateToken(existingUser.id);

    res.cookie("Authentication", token, cookieConfig);
    res.status(200).json({
      "access_token": token,
      "user": {
        "id": existingUser.id,
        "username": existingUser.username,
        "email": existingUser.email,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation errors",
        errors: error.errors,
      });
    }

    console.error("Error during singin:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});
app.get("/videos/feed", async (req:Request,res:Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const category = req.query.category as string;

    
    const offset = (page - 1) * limit;

   
    const filter: any = {};
    if (category) {
      filter.category = category;
    }

    // Fetch videos and total count
    const [videos, totalCount] = await Promise.all([
      prisma.video.findMany({
        where: filter,
        skip: offset,
        take: limit,
        orderBy: { created_at: "desc" },
        include: {
          creator: {
            select: {
              id: true,
              user: true,
            },
          },
        },
      }),
      prisma.video.count({ where: filter }),
    ]);

   
    const totalPages = Math.ceil(totalCount / limit);

 
    const response = {
      videos: videos.map((video) => ({
        id: video.id,
        title: video.title,
        thumbnail_url: video.thumnail_url, // Assuming a `thumbnailUrl` field exists
        creator: {
          id: video.creator.id,
          username: video.creator.user.username,
        },
        view_count: video.viewCount, // Assuming a `viewCount` field exists
        created_at: video.created_at,
      })),
      total_pages: totalPages,
      current_page: page,
    };
  } catch (error) {
res.status(400).json(error)
  }
});
app.get(
  "/get/id",
  user,
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const user = req.user;
      console.log(user);
      res.json(user);
    } catch (error) {
      res.json({
        msg: "incorrect user",
      });
    }
  }
);
app.post(
  "/channels",
  user,
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { name, description, slug } = req.body;
      const payloadParser = channelInputParser.parse({
        name,
        description,
        slug,
      });
      const userId = req.user;
      const channelExist = await prisma.channel.findFirst({
        where: {
          userId: userId,
        },
      });
      if (channelExist) {
        res.status(411).json({
          msg: "channel exist",
        });
        return;
      }
      const slugExist = await prisma.channel.findFirst({
        where: {
          slug: slug,
        },
      });
      if (slugExist) {
        res.status(409).json({
          msg: "slug exist",
        });
        return;
      }
      const channel = await prisma.channel.create({
        data: {
          name,
          description,
          slug,
          userId,
        },
      });

      res.status(201).json({
        channel,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation errors",
          errors: error.errors,
        });
      }

      console.error("Error during channel creation:", error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

app.get(
  "/channels/:slug",
  user,
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const slug = req.params.slug;

      const userId = req.user;
      const channel = await prisma.channel.findFirst({
        where: {
          slug: slug,
        },
        include: {
          videos: true,
        },
      });
      res.status(201).json({
        channel,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

app.post(
  "/videos/upload",
  user,
  upload.single("file"),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const userId = req.user;
      const { title, description, category } = req.body;
      const fileContent = await fs.readFile(req.file.path);
      const transaction = await prisma.$transaction(async (tx) => {
        const { data ,error} = await supabase.storage
          .from("video")
          .upload(`${Date.now()}-${req.file?.filename}`, fileContent, {
            contentType: req.file?.mimetype,
          });
          if(error){
            res.status(400).json({
              msg:"error while supabase upload"
            })
            return
          }
        const channel = await tx.channel.findFirst({
          where: {
            userId,
          },
        });
        const videoData = tx.video.create({
          data: {
            title,
            description,
            category,
            channelId: channel?.id as string,
            status: "PROCESSING",
            userId,
          },
        });

        return videoData;
      });
      await fs.unlink(req.file.path);
      res.status(201).json({
        id: transaction?.id,
        title: transaction?.title,
        processing_status: transaction?.status,
        qualities: ["240p", "480p", "720p"],
      });
    } catch (error) {
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);
app.get("/videos/:id", async (req:Request,res:Response) => {
  try {
    const videoId = req.params.id
    const videoDetails = await prisma.video.findFirst({
      where:{

        id:videoId
      },
      select:{
        id:true,
        title:true,
        description:true,
        creator:true,
        status:true
      }
    })

    
    res.status(200).json({
       videoDetails
    })

   
  } catch (error) {}
});

app.get("/videos/:videoId/time", async (req:Request,res:Response)=>{
  try {
    const videoId = req.params.videoId
    const {timestamp} = req.body
    const videotime = await prisma.video.update({
where:{
  id:videoId
},
data:{
  currentTimestamp:timestamp
}
    })
    res.status(201).json({
      videotime
    })


  } catch (error) {
    res.status(400).json(error)
    
  }
})
export default app;
